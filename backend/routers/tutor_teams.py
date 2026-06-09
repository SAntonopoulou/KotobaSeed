"""TutorTeam management endpoints.

Available actions for the team owner:
- GET  /tutor/team               — fetch their team + roster + pending invites
- POST /tutor/team/invites       — invite by email (creates row, sends mail)
- DELETE /tutor/team/invites/:id — revoke a pending invite
- DELETE /tutor/team/members/:id — remove a member (Tutor.team_id = NULL)

For invitees (no auth required):
- GET  /tutor/team/invites/by-token/:token  — verify a token before accepting
- POST /tutor/team/invites/accept           — accept (requires the user to
                                              be logged in OR include the
                                              token + a new-user payload —
                                              v1 keeps it simple and requires
                                              the recipient to be signed in)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    SubscriptionTier,
    Tutor,
    TutorTeam,
    TutorTeamInvite,
    TutorTeamInviteStatus,
    User,
)
from ..services import team_protection as _protection, teams as _teams
from ..services.email import send_team_invite

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tutor/team", tags=["tutor-team"])


# --- schemas ----------------------------------------------------------


class TeamMember(BaseModel):
    tutor_id: int
    user_id: int
    full_name: str
    email: str
    tutor_slug: str
    is_owner: bool


class TeamInviteRead(BaseModel):
    id: int
    email: str
    status: TutorTeamInviteStatus
    expires_at: datetime
    created_at: datetime


class TeamRead(BaseModel):
    id: int
    name: str
    max_seats: int
    seats_used: int
    seats_available: int
    poaching_protection_days: int
    members: list[TeamMember]
    pending_invites: list[TeamInviteRead]
    is_owner: bool


class TeamRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteCreate(BaseModel):
    email: EmailStr


# --- helpers ----------------------------------------------------------


def _resolve_team_for_user(session: Session, user: User) -> TutorTeam | None:
    """Return the TutorTeam the user is part of (as owner or as a member),
    or None if they're not in a team. Owners take precedence."""
    owned = session.exec(
        select(TutorTeam).where(TutorTeam.owner_user_id == user.id)
    ).first()
    if owned is not None:
        return owned
    # Find via membership.
    tutor = session.exec(select(Tutor).where(Tutor.user_id == user.id)).first()
    if tutor is None or tutor.team_id is None:
        return None
    return session.get(TutorTeam, tutor.team_id)


def _serialize_team(
    session: Session, team: TutorTeam, viewer: User
) -> TeamRead:
    members_rows = session.exec(
        select(Tutor).where(Tutor.team_id == team.id)
    ).all()
    members: list[TeamMember] = []
    for tutor in members_rows:
        u = session.get(User, tutor.user_id)
        if u is None:
            continue
        members.append(
            TeamMember(
                tutor_id=tutor.id,
                user_id=u.id,
                full_name=u.full_name or u.email,
                email=u.email,
                tutor_slug=tutor.tutor_slug,
                is_owner=u.id == team.owner_user_id,
            )
        )
    pending = session.exec(
        select(TutorTeamInvite).where(
            TutorTeamInvite.team_id == team.id,
            TutorTeamInvite.status == TutorTeamInviteStatus.PENDING,
            TutorTeamInvite.expires_at > datetime.utcnow(),
        )
    ).all()
    pending_reads = [
        TeamInviteRead(
            id=p.id,
            email=p.email,
            status=p.status,
            expires_at=p.expires_at,
            created_at=p.created_at,
        )
        for p in pending
    ]
    seats_used = len(members) + len(pending_reads)
    return TeamRead(
        id=team.id,
        name=team.name,
        max_seats=team.max_seats,
        seats_used=seats_used,
        seats_available=max(0, team.max_seats - seats_used),
        poaching_protection_days=team.poaching_protection_days,
        members=members,
        pending_invites=pending_reads,
        is_owner=viewer.id == team.owner_user_id,
    )


def _require_owner(team: TutorTeam, user: User) -> None:
    if team.owner_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can manage seats.",
        )


# --- endpoints --------------------------------------------------------


@router.get("", response_model=TeamRead | None)
def read_my_team(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TeamRead | None:
    """Returns the user's team (as owner OR member), or null if they
    aren't part of one. Used by the dashboard to decide whether to
    render the Team panel.
    """
    team = _resolve_team_for_user(session, current)
    if team is None:
        return None
    return _serialize_team(session, team, current)


@router.patch("", response_model=TeamRead)
def rename_team(
    payload: TeamRename,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TeamRead:
    """Owner — rename the team. The name is shown to invitees in their
    accept-email + on the team's shared customer-facing surfaces."""
    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team for this user."
        )
    _require_owner(team, current)
    team.name = payload.name.strip()
    team.updated_at = datetime.now(UTC)
    session.add(team)
    session.commit()
    session.refresh(team)
    return _serialize_team(session, team, current)


@router.post(
    "/invites", response_model=TeamInviteRead, status_code=status.HTTP_201_CREATED
)
def invite_member(
    payload: InviteCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TeamInviteRead:
    """Owner — invite by email. Creates a pending invite row, sends the
    Resend email with the accept link, returns the invite for display."""
    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No team to invite to.",
        )
    _require_owner(team, current)

    if current.subscription_tier != SubscriptionTier.BUSINESS:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Team invites are a Business-plan feature.",
        )

    email = str(payload.email).strip().lower()

    # Block invite to someone who's already a member.
    existing_member = session.exec(
        select(Tutor)
        .join(User, User.id == Tutor.user_id)
        .where(Tutor.team_id == team.id, User.email == email)
    ).first()
    if existing_member is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is already on the team.",
        )

    # Block duplicate pending invites.
    duplicate = session.exec(
        select(TutorTeamInvite).where(
            TutorTeamInvite.team_id == team.id,
            TutorTeamInvite.email == email,
            TutorTeamInvite.status == TutorTeamInviteStatus.PENDING,
            TutorTeamInvite.expires_at > datetime.utcnow(),
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There's already a pending invite to that address.",
        )

    # Seat cap: existing members + pending invites must stay under max_seats.
    seats_used = _teams.count_active_seats(
        session, team.id
    ) + _teams.count_pending_invites(session, team.id)
    if seats_used >= team.max_seats:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Your team is full. Add more seats from the Team panel before "
                "inviting another member."
            ),
        )

    invite = _teams.new_invite(
        session=session, team=team, email=email, invited_by=current
    )
    session.commit()
    session.refresh(invite)

    # Email is best-effort — invite row exists either way so we can resend.
    try:
        send_team_invite(
            to_email=email,
            team_name=team.name,
            inviter_name=current.full_name or "Your team owner",
            token=invite.token,
        )
    except Exception:
        log.exception("Could not send team-invite email to %s", email)

    return TeamInviteRead(
        id=invite.id,
        email=invite.email,
        status=invite.status,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner — revoke a pending invite. The invitee's accept link returns
    410 after revocation."""
    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team."
        )
    _require_owner(team, current)
    invite = session.get(TutorTeamInvite, invite_id)
    if invite is None or invite.team_id != team.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found."
        )
    if invite.status != TutorTeamInviteStatus.PENDING:
        return  # idempotent — already gone
    invite.status = TutorTeamInviteStatus.REVOKED
    session.add(invite)
    session.commit()


@router.delete(
    "/members/{tutor_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_member(
    tutor_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner — remove a member. The leaver's site theme resets to default
    and any students they taught while on the team enter the school's
    non-compete window (TutorTeam.poaching_protection_days)."""
    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team."
        )
    _require_owner(team, current)
    tutor = session.get(Tutor, tutor_id)
    if tutor is None or tutor.team_id != team.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found."
        )
    if tutor.user_id == team.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The owner is removed by cancelling the Business subscription.",
        )
    _protection.process_tutor_left_team(tutor, team, session, commit=True)


class TeamProtectionSettings(BaseModel):
    poaching_protection_days: int = Field(ge=0, le=365)


@router.patch("/protection", response_model=TeamRead)
def update_protection_days(
    payload: TeamProtectionSettings,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TeamRead:
    """Owner — set the non-compete window length applied to future leavers.
    Existing TutorProtectedStudent rows are not retroactively re-stamped;
    each leaver locks in whatever the policy was at their departure."""
    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team."
        )
    _require_owner(team, current)
    team.poaching_protection_days = payload.poaching_protection_days
    team.updated_at = datetime.now(UTC)
    session.add(team)
    session.commit()
    session.refresh(team)
    return _serialize_team(session, team, current)


@router.post("/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_team(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Member — leave the team they're on. Same protection rules apply as
    when the owner removes a member. The owner cannot self-leave (they
    must cancel the Business subscription instead)."""
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current.id)).first()
    if tutor is None or tutor.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You aren't part of a team.",
        )
    team = session.get(TutorTeam, tutor.team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found."
        )
    if team.owner_user_id == current.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owners leave by cancelling the Business subscription.",
        )
    _protection.process_tutor_left_team(tutor, team, session, commit=True)


class ProtectionStatusRow(BaseModel):
    student_user_id: int
    former_team_id: int
    protection_ends_at: datetime


class SeatPurchaseRequest(BaseModel):
    quantity: int = Field(ge=1, le=25)
    billing: str = Field(default="monthly")  # 'monthly' | 'annual'


class SeatPurchaseResponse(BaseModel):
    new_max_seats: int
    subscription_item_id: str
    quantity: int


@router.post("/seats", response_model=SeatPurchaseResponse)
def add_extra_seats(
    payload: SeatPurchaseRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> SeatPurchaseResponse:
    """Owner — add N extra seats to the Business subscription via Stripe
    SubscriptionItem. Idempotent in the sense that subsequent calls
    update the item's quantity rather than create new items. Quantity is
    the TOTAL extra seats (not a delta) so the UI can simply send the
    final number it wants.
    """
    import os

    import stripe

    team = _resolve_team_for_user(session, current)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No team."
        )
    _require_owner(team, current)

    if not current.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Finish your Business subscription before adding seats.",
        )
    if payload.billing not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid billing cadence.",
        )

    if payload.billing == "monthly":
        seat_price_id = settings.stripe_business_seat_price_id
    else:
        seat_price_id = settings.stripe_business_seat_annual_price_id
    if not seat_price_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extra-seat pricing isn't configured yet. Contact support.",
        )

    api_key = os.environ.get("STRIPE_SECRET_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server is misconfigured.",
        )

    # Find the active Business subscription on the customer.
    try:
        subs = stripe.Subscription.list(
            api_key=api_key,
            customer=current.stripe_customer_id,
            status="all",
            limit=20,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Stripe.",
        ) from e

    business_price_ids = {
        os.environ.get("STRIPE_BUSINESS_PRICE_ID"),
        os.environ.get("STRIPE_BUSINESS_ANNUAL_PRICE_ID"),
    } - {None}
    chosen_sub = None
    for sub in subs.data:
        if sub.status not in ("active", "trialing", "past_due"):
            continue
        for item in sub["items"]["data"]:
            if item.get("price", {}).get("id") in business_price_ids:
                chosen_sub = sub
                break
        if chosen_sub is not None:
            break
    if chosen_sub is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active Business subscription found on your account.",
        )

    # Update existing seat item, or add a new one.
    seat_item_id = team.stripe_seat_subscription_item_id
    existing_item = None
    if seat_item_id:
        for item in chosen_sub["items"]["data"]:
            if item.id == seat_item_id:
                existing_item = item
                break
    try:
        if existing_item is not None:
            stripe.SubscriptionItem.modify(
                seat_item_id,
                api_key=api_key,
                quantity=payload.quantity,
                proration_behavior="create_prorations",
            )
        else:
            new_item = stripe.SubscriptionItem.create(
                api_key=api_key,
                subscription=chosen_sub.id,
                price=seat_price_id,
                quantity=payload.quantity,
                proration_behavior="create_prorations",
            )
            seat_item_id = new_item.id
    except Exception as e:
        log.exception("Stripe seat update failed for team %s", team.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not update your subscription. Try again in a moment.",
        ) from e

    # Persist new max_seats locally.
    team.stripe_seat_subscription_item_id = seat_item_id
    team.max_seats = 5 + payload.quantity
    team.updated_at = datetime.now(UTC)
    session.add(team)
    session.commit()
    return SeatPurchaseResponse(
        new_max_seats=team.max_seats,
        subscription_item_id=seat_item_id,
        quantity=payload.quantity,
    )


@router.get("/leavers-protection", response_model=list[ProtectionStatusRow])
def my_active_protections(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[ProtectionStatusRow]:
    """Read-only view a tutor sees on their dashboard: every student
    they're currently blocked from teaching directly because of a recent
    team-leave. Helps them plan around the window expiry rather than be
    surprised by a 403 at booking time."""
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current.id)).first()
    if tutor is None:
        return []
    rows = _protection.list_active_protections_for_tutor(tutor.id, session)
    return [
        ProtectionStatusRow(
            student_user_id=r.student_user_id,
            former_team_id=r.former_team_id,
            protection_ends_at=r.protection_ends_at,
        )
        for r in rows
    ]


# --- invitee surface (token-based) ------------------------------------


class InviteVerifyResponse(BaseModel):
    team_name: str
    inviter_name: str
    email: str
    expires_at: datetime


@router.get("/invites/by-token/{token}", response_model=InviteVerifyResponse)
def verify_invite(
    token: str,
    session: Annotated[Session, Depends(get_session)],
) -> InviteVerifyResponse:
    """Public — used by the accept page to display invite context before
    the user is logged in. Returns 404 for revoked / expired / unknown."""
    invite = session.exec(
        select(TutorTeamInvite).where(TutorTeamInvite.token == token)
    ).first()
    if invite is None or invite.status != TutorTeamInviteStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found."
        )
    expiry = invite.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if expiry < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="Invite has expired."
        )
    team = session.get(TutorTeam, invite.team_id)
    inviter = session.get(User, invite.invited_by_user_id)
    return InviteVerifyResponse(
        team_name=team.name if team else "(unknown team)",
        inviter_name=(inviter.full_name if inviter else "(unknown)"),
        email=invite.email,
        expires_at=invite.expires_at,
    )


class InviteAcceptRequest(BaseModel):
    token: str


@router.post("/invites/accept", response_model=TeamRead)
def accept_invite(
    payload: InviteAcceptRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TeamRead:
    """Signed-in user accepts a team invite. Their existing Tutor row's
    team_id is set; if they don't yet have a Tutor row, this endpoint
    returns a 409 telling them to finish tutor onboarding first.
    """
    invite = session.exec(
        select(TutorTeamInvite).where(TutorTeamInvite.token == payload.token)
    ).first()
    if invite is None or invite.status != TutorTeamInviteStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found."
        )
    expiry = invite.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if expiry < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="Invite has expired."
        )

    # Only the invited email may accept — protects against link sharing
    # giving access to someone the owner didn't approve.
    if (current.email or "").strip().lower() != invite.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invite is for a different email address.",
        )

    team = session.get(TutorTeam, invite.team_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team is gone."
        )

    # Seat cap re-check at acceptance time — owner could have shrunk it.
    if _teams.count_active_seats(session, team.id) >= team.max_seats:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The team is full. The owner needs to add a seat first.",
        )

    tutor = session.exec(
        select(Tutor).where(Tutor.user_id == current.id)
    ).first()
    if tutor is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Finish setting up your tutor profile first, then accept "
                "this invite again."
            ),
        )

    now = datetime.now(UTC)
    tutor.team_id = team.id
    tutor.updated_at = now
    invite.status = TutorTeamInviteStatus.ACCEPTED
    invite.accepted_at = now
    invite.accepted_by_user_id = current.id
    session.add(tutor)
    session.add(invite)
    session.commit()
    session.refresh(team)
    return _serialize_team(session, team, current)
