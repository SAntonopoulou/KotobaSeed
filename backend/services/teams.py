"""TutorTeam helpers.

A team is the "school" that owns a Business subscription. The owner is
the User who pays; other members are tutors who accepted an invite and
whose Tutor.team_id points back here.

This module is the single source of truth for team lifecycle bookkeeping:
- ensure_team_for_owner: idempotent create-on-Business-activate
- count_active_seats: how many seats are currently filled
- mint_invite_token: cryptographically random URL-safe token
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..models import Tutor, TutorTeam, TutorTeamInvite, TutorTeamInviteStatus, User

log = logging.getLogger(__name__)


INVITE_TTL_DAYS = 14
DEFAULT_TEAM_MAX_SEATS = 5


def ensure_team_for_owner(
    session: Session,
    owner: User,
    *,
    name: str | None = None,
    commit: bool = True,
) -> TutorTeam:
    """Create a TutorTeam owned by `owner` if one doesn't already exist.

    Called from the Business activation webhook. Also attaches the
    owner's primary Tutor row to the team so they immediately count as
    seat 1/5. Safe to call on every webhook event — the existence check
    short-circuits when the team is already there.
    """
    existing = session.exec(
        select(TutorTeam).where(TutorTeam.owner_user_id == owner.id)
    ).first()
    if existing is not None:
        # Make sure the owner's tutor is linked in case the row was
        # created before the team did.
        _attach_owner_tutor(session, owner, existing, commit=False)
        if commit:
            session.commit()
        return existing

    display_name = (name or owner.full_name or "My team").strip()[:120] or "My team"
    team = TutorTeam(
        owner_user_id=owner.id,
        name=display_name,
        max_seats=DEFAULT_TEAM_MAX_SEATS,
    )
    session.add(team)
    session.flush()
    _attach_owner_tutor(session, owner, team, commit=False)
    if commit:
        session.commit()
        session.refresh(team)
    log.info("Created TutorTeam #%s for owner user %s", team.id, owner.id)
    return team


def _attach_owner_tutor(
    session: Session,
    owner: User,
    team: TutorTeam,
    *,
    commit: bool = False,
) -> None:
    tutor = session.exec(
        select(Tutor).where(Tutor.user_id == owner.id)
    ).first()
    if tutor is None:
        return
    if tutor.team_id == team.id:
        return
    tutor.team_id = team.id
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)
    if commit:
        session.commit()


def count_active_seats(session: Session, team_id: int) -> int:
    """Number of Tutor rows currently bound to this team."""
    rows = session.exec(
        select(Tutor).where(Tutor.team_id == team_id)
    ).all()
    return len(rows)


def count_pending_invites(session: Session, team_id: int) -> int:
    """Outstanding invites that still consume a future seat slot."""
    rows = session.exec(
        select(TutorTeamInvite).where(
            TutorTeamInvite.team_id == team_id,
            TutorTeamInvite.status == TutorTeamInviteStatus.PENDING,
            TutorTeamInvite.expires_at > datetime.now(UTC),
        )
    ).all()
    return len(rows)


def mint_invite_token() -> str:
    """Cryptographically random URL-safe token used in the accept link."""
    return secrets.token_urlsafe(32)


def new_invite(
    *,
    session: Session,
    team: TutorTeam,
    email: str,
    invited_by: User,
    ttl_days: int = INVITE_TTL_DAYS,
) -> TutorTeamInvite:
    """Build (but don't commit) a pending invite row. Caller is responsible
    for committing + dispatching the email."""
    invite = TutorTeamInvite(
        team_id=team.id,
        email=email.strip().lower(),
        token=mint_invite_token(),
        invited_by_user_id=invited_by.id,
        status=TutorTeamInviteStatus.PENDING,
        expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
    )
    session.add(invite)
    return invite
