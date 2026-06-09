"""Group lesson sessions.

A group LessonPack (is_group=True) is the *product*; a GroupSession is one
*scheduled instance* of it that students each book a seat in. Bookings
linked to the session sit in PENDING_GROUP_MIN after payment until the
auto-evaluation cron either confirms or refunds the cohort based on
min_students.

Endpoints split between tutor-owned and public:
- Tutor: create / list / cancel sessions
- Public: list upcoming open sessions; book a seat (Stripe Checkout)
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Booking,
    BookingStatus,
    GroupSession,
    LessonPack,
    Tutor,
    User,
)
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["group-sessions"])


# --- Schemas --------------------------------------------------------------


class GroupSessionRead(BaseModel):
    id: int
    tutor_id: int
    lesson_pack_id: int
    pack_name: str
    pack_description: str | None
    scheduled_at: datetime
    duration_minutes: int
    threshold_eval_at: datetime
    is_cancelled: bool
    max_students: int
    min_students: int
    seats_filled: int
    seats_available: int
    price_cents: int
    currency: str
    notes: str | None


class GroupSessionCreate(BaseModel):
    lesson_pack_id: int
    scheduled_at: datetime
    notes: str | None = Field(default=None, max_length=2000)


class GroupBookingCheckout(BaseModel):
    group_session_id: int


class GroupBookingCheckoutResponse(BaseModel):
    checkout_url: str


# --- Helpers --------------------------------------------------------------


def _serialize(session_db: Session, gs: GroupSession) -> GroupSessionRead:
    pack = session_db.get(LessonPack, gs.lesson_pack_id)
    if pack is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Group session references a deleted pack.",
        )
    # Count bookings that are still "alive" — pending+confirmed both count
    # toward capacity. Refunded/cancelled obviously don't.
    alive = session_db.exec(
        select(Booking).where(
            Booking.group_session_id == gs.id,
            Booking.status.in_(
                [
                    BookingStatus.PENDING_PAYMENT,
                    BookingStatus.PENDING_GROUP_MIN,
                    BookingStatus.CONFIRMED,
                    BookingStatus.COMPLETED,
                ]
            ),
        )
    ).all()
    seats_filled = len(alive)
    max_students = pack.max_students or 0
    return GroupSessionRead(
        id=gs.id,
        tutor_id=gs.tutor_id,
        lesson_pack_id=gs.lesson_pack_id,
        pack_name=pack.name,
        pack_description=pack.description,
        scheduled_at=gs.scheduled_at,
        duration_minutes=gs.duration_minutes,
        threshold_eval_at=gs.threshold_eval_at,
        is_cancelled=gs.is_cancelled,
        max_students=max_students,
        min_students=pack.min_students or 0,
        seats_filled=seats_filled,
        seats_available=max(max_students - seats_filled, 0),
        price_cents=pack.price_cents,
        currency=pack.currency,
        notes=gs.notes,
    )


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


# --- Tutor-side endpoints -------------------------------------------------


@router.post(
    "/tutor/group-sessions",
    response_model=GroupSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_group_session(
    payload: GroupSessionCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> GroupSessionRead:
    _require_owner(tutor, current)
    pack = session.get(LessonPack, payload.lesson_pack_id)
    if pack is None or pack.tutor_id != tutor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found."
        )
    if not pack.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That pack isn't configured for group lessons.",
        )
    if pack.max_students is None or pack.min_students is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set max_students and min_students on the pack first.",
        )
    if pack.min_students > pack.max_students:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum can't exceed maximum.",
        )

    sched = payload.scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=UTC)
    if sched <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sessions must be scheduled in the future.",
        )

    # Quota gate (covers Sophia's Daily.co bill — one room, regardless of
    # how many seats sell).
    from ..services import minute_quota
    if minute_quota.would_exceed_quota(
        tutor, tutor.user, pack.duration_minutes, session
    ):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "You've hit this month's classroom-minute quota. "
                "Upgrade your plan or schedule the session for next month."
            ),
        )

    threshold = sched - timedelta(hours=pack.group_min_threshold_hours)
    gs = GroupSession(
        tutor_id=tutor.id,
        lesson_pack_id=pack.id,
        scheduled_at=sched,
        duration_minutes=pack.duration_minutes,
        threshold_eval_at=threshold,
        notes=payload.notes,
    )
    session.add(gs)
    session.commit()
    session.refresh(gs)
    minute_quota.record_group_session_minutes(gs, session, commit=True)
    return _serialize(session, gs)


@router.get("/tutor/group-sessions", response_model=list[GroupSessionRead])
def list_my_group_sessions(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[GroupSessionRead]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(GroupSession)
        .where(GroupSession.tutor_id == tutor.id)
        .order_by(GroupSession.scheduled_at.desc())
    ).all()
    return [_serialize(session, gs) for gs in rows]


@router.delete(
    "/tutor/group-sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def cancel_group_session(
    session_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Cancel a future group session. Refunds all paid seats automatically."""
    _require_owner(tutor, current)
    gs = session.get(GroupSession, session_id)
    if gs is None or gs.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    gs.is_cancelled = True
    gs.updated_at = datetime.now(UTC)
    session.add(gs)

    # Refund every paid seat. We reuse the standard Booking refund path
    # rather than dispatching Stripe inline so chargeback handling stays
    # consistent.
    from ..services import group_lessons, minute_quota

    group_lessons.refund_session_bookings(session, gs, reason="tutor_cancelled")
    # Release the reserved-minute row so the quota meter actually drops
    # — the auto-evaluation cron path does this already; the tutor-
    # initiated cancel path was leaking minutes forever and eventually
    # bricked the meter at "fully booked" for the rest of the cycle.
    minute_quota.release_group_session_minutes(gs, session)
    session.commit()
    return None


# --- Public-facing endpoints ----------------------------------------------


@router.get("/group-sessions", response_model=list[GroupSessionRead])
def list_public_group_sessions(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[GroupSessionRead]:
    """Public — upcoming, non-cancelled group sessions for this tutor that
    still have seats. Used by the tutor public site to render bookable
    cards."""
    now = datetime.now(UTC)
    rows = session.exec(
        select(GroupSession)
        .where(
            GroupSession.tutor_id == tutor.id,
            GroupSession.scheduled_at > now,
            GroupSession.is_cancelled.is_(False),
        )
        .order_by(GroupSession.scheduled_at)
    ).all()
    out: list[GroupSessionRead] = []
    for gs in rows:
        view = _serialize(session, gs)
        if view.seats_available > 0:
            out.append(view)
    return out


@router.post("/group-sessions/checkout", response_model=GroupBookingCheckoutResponse)
def start_group_booking_checkout(
    payload: GroupBookingCheckout,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> GroupBookingCheckoutResponse:
    """Student opens a Stripe Checkout for a group session seat. On webhook
    completion the booking flips to PENDING_GROUP_MIN; the threshold cron
    later transitions to CONFIRMED or REFUNDED."""
    gs = session.get(GroupSession, payload.group_session_id)
    if gs is None or gs.is_cancelled or gs.tutor_id != tutor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group session not found."
        )
    pack = session.get(LessonPack, gs.lesson_pack_id)
    if pack is None or not pack.is_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group session not found."
        )

    # Reject if at capacity OR if the student already booked this session.
    existing = session.exec(
        select(Booking).where(
            Booking.group_session_id == gs.id,
            Booking.student_user_id == current.id,
            Booking.status.in_(
                [
                    BookingStatus.PENDING_PAYMENT,
                    BookingStatus.PENDING_GROUP_MIN,
                    BookingStatus.CONFIRMED,
                    BookingStatus.COMPLETED,
                ]
            ),
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already booked this group session.",
        )

    # Non-compete: same protection that applies to 1:1 + trial bookings.
    from ..services import team_protection as _protection
    blocked = _protection.is_student_protected_from_tutor(
        tutor_id=tutor.id, student_user_id=current.id, session=session
    )
    if blocked is not None:
        ends = blocked.protection_ends_at.strftime("%d %b %Y")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This tutor recently moved from a school where you studied. "
                f"Direct bookings between you re-open on {ends}."
            ),
        )

    view = _serialize(session, gs)
    if view.seats_available <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This group session is full.",
        )

    # Platform fee from the same table as 1:1 lessons.
    from ..services.platform_fees import lesson_platform_fee

    tutor_user = session.get(User, tutor.user_id)
    if tutor_user is None or not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This tutor isn't ready to accept payments yet.",
        )
    fee_cents = lesson_platform_fee(tutor_user, pack.price_cents)

    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=current.id,
        lesson_pack_id=pack.id,
        group_session_id=gs.id,
        tutor_team_id=tutor.team_id,
        scheduled_at=gs.scheduled_at,
        duration_minutes=gs.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        platform_fee_cents=fee_cents,
        status=BookingStatus.PENDING_PAYMENT,
    )
    session.add(booking)
    from ..services import enrollment as _enroll
    _enroll.ensure_enrollment(
        student_user_id=current.id, tutor_id=tutor.id, session=session
    )
    session.commit()
    session.refresh(booking)

    try:
        frontend = settings.frontend_url.rstrip("/")
        success_url = f"{frontend}/booking/success?booking_id={booking.id}"
        cancel_url = f"{frontend}/booking/cancelled?booking_id={booking.id}"
        checkout = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=current.email,
            line_items=[
                {
                    "price_data": {
                        "currency": pack.currency,
                        "product_data": {
                            "name": f"Group lesson: {pack.name}",
                        },
                        "unit_amount": pack.price_cents,
                    },
                    "quantity": 1,
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee_cents,
                "transfer_data": {
                    "destination": tutor.stripe_connect_account_id,
                },
            },
            metadata={
                "type": "group_booking",
                "booking_id": str(booking.id),
                "group_session_id": str(gs.id),
            },
        )
    except stripe.error.StripeError:
        log.exception("Stripe error starting group booking checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Try again in a moment.",
        ) from None

    booking.stripe_checkout_session_id = checkout["id"]
    session.add(booking)
    session.commit()

    return GroupBookingCheckoutResponse(checkout_url=checkout["url"])
