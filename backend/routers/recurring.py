"""Recurring booking plans.

Students set up a standing weekly slot with a tutor; the platform
auto-generates child Booking rows on a rolling horizon. Each lesson is
billed individually via the normal Stripe Checkout flow.

Cancellation stops new generation but doesn't touch already-generated
bookings — the student can pay for those or let them auto-cancel.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Booking,
    BookingStatus,
    LessonPack,
    RecurringBookingPlan,
    Tutor,
)
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["recurring"])


# --- Schemas --------------------------------------------------------------


class RecurringPlanRead(BaseModel):
    id: int
    tutor_id: int
    tutor_display_name: str | None = None
    student_user_id: int
    lesson_pack_id: int
    pack_name: str | None = None
    day_of_week: int
    start_minute: int
    duration_minutes: int
    price_cents: int
    currency: str
    status: str
    lookahead_weeks: int
    start_date: datetime
    cancelled_at: datetime | None
    upcoming_bookings: int = 0
    created_at: datetime


class RecurringPlanCreate(BaseModel):
    lesson_pack_id: int
    day_of_week: int = Field(ge=0, le=6)
    start_minute: int = Field(ge=0, le=1439)
    start_date: datetime
    lookahead_weeks: int = Field(default=4, ge=1, le=12)


# --- Helpers --------------------------------------------------------------


def _serialize(session: Session, plan: RecurringBookingPlan) -> RecurringPlanRead:
    tutor = session.get(Tutor, plan.tutor_id)
    pack = session.get(LessonPack, plan.lesson_pack_id)
    upcoming = session.exec(
        select(Booking).where(
            Booking.recurring_plan_id == plan.id,
            Booking.scheduled_at > datetime.now(UTC),
            Booking.status.in_(
                [
                    BookingStatus.PENDING_PAYMENT,
                    BookingStatus.CONFIRMED,
                ]
            ),
        )
    ).all()
    return RecurringPlanRead(
        id=plan.id,
        tutor_id=plan.tutor_id,
        tutor_display_name=tutor.display_name if tutor else None,
        student_user_id=plan.student_user_id,
        lesson_pack_id=plan.lesson_pack_id,
        pack_name=pack.name if pack else None,
        day_of_week=plan.day_of_week,
        start_minute=plan.start_minute,
        duration_minutes=plan.duration_minutes,
        price_cents=plan.price_cents,
        currency=plan.currency,
        status=plan.status,
        lookahead_weeks=plan.lookahead_weeks,
        start_date=plan.start_date,
        cancelled_at=plan.cancelled_at,
        upcoming_bookings=len(upcoming),
        created_at=plan.created_at,
    )


# --- Student-side endpoints -----------------------------------------------


@router.post(
    "/recurring/plans",
    response_model=RecurringPlanRead,
    status_code=status.HTTP_201_CREATED,
)
def create_recurring_plan(
    payload: RecurringPlanCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> RecurringPlanRead:
    """Student sets up a standing weekly lesson with the current tenant's tutor."""
    pack = session.get(LessonPack, payload.lesson_pack_id)
    if pack is None or pack.tutor_id != tutor.id or not pack.is_active:
        raise HTTPException(status_code=404, detail="Lesson pack not found.")

    # Non-compete: a recurring plan IS a booking commitment, block it
    # if the student is in this tutor's active protection window.
    from ..services import team_protection as _protection
    blocked = _protection.is_student_protected_from_tutor(
        tutor_id=tutor.id, student_user_id=current.id, session=session
    )
    if blocked is not None:
        ends = blocked.protection_ends_at.strftime("%d %b %Y")
        raise HTTPException(
            status_code=403,
            detail=(
                f"This tutor recently moved from a school where you studied. "
                f"Direct bookings between you re-open on {ends}."
            ),
        )
    if pack.is_group:
        raise HTTPException(
            status_code=400,
            detail="Recurring plans aren't available on group lessons yet.",
        )
    if pack.num_lessons != 1:
        raise HTTPException(
            status_code=400,
            detail="Pick a single-lesson pack for recurring bookings.",
        )

    # No double-booking: one active plan per (tutor, student, slot).
    existing = session.exec(
        select(RecurringBookingPlan).where(
            RecurringBookingPlan.tutor_id == tutor.id,
            RecurringBookingPlan.student_user_id == current.id,
            RecurringBookingPlan.day_of_week == payload.day_of_week,
            RecurringBookingPlan.start_minute == payload.start_minute,
            RecurringBookingPlan.status == "active",
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="You already have an active recurring plan at that slot.",
        )

    start_date = payload.start_date
    if start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=UTC)

    plan = RecurringBookingPlan(
        tutor_id=tutor.id,
        student_user_id=current.id,
        lesson_pack_id=pack.id,
        day_of_week=payload.day_of_week,
        start_minute=payload.start_minute,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        lookahead_weeks=payload.lookahead_weeks,
        start_date=start_date,
        status="active",
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)

    # Eagerly generate the first batch so the student sees bookings on
    # their dashboard immediately.
    from ..services import recurring_bookings

    recurring_bookings.generate_bookings_for_plan(session, plan)
    return _serialize(session, plan)


@router.get("/recurring/plans/mine", response_model=list[RecurringPlanRead])
def list_my_plans(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[RecurringPlanRead]:
    rows = session.exec(
        select(RecurringBookingPlan)
        .where(RecurringBookingPlan.student_user_id == current.id)
        .order_by(RecurringBookingPlan.created_at.desc())
    ).all()
    return [_serialize(session, p) for p in rows]


@router.post(
    "/recurring/plans/{plan_id}/cancel", response_model=RecurringPlanRead
)
def cancel_my_plan(
    plan_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> RecurringPlanRead:
    plan = session.get(RecurringBookingPlan, plan_id)
    if plan is None or plan.student_user_id != current.id:
        raise HTTPException(status_code=404, detail="Plan not found.")
    if plan.status != "active":
        return _serialize(session, plan)
    plan.status = "cancelled"
    plan.cancelled_at = datetime.now(UTC)
    plan.updated_at = datetime.now(UTC)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _serialize(session, plan)


# --- Tutor-side endpoint --------------------------------------------------


@router.get("/tutor/recurring/plans", response_model=list[RecurringPlanRead])
def list_tutor_recurring(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[RecurringPlanRead]:
    """Tutor view — every recurring plan a student has set up against
    them. Helps the tutor see who has standing slots."""
    if tutor.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not your tutor profile.")
    rows = session.exec(
        select(RecurringBookingPlan)
        .where(RecurringBookingPlan.tutor_id == tutor.id)
        .order_by(RecurringBookingPlan.created_at.desc())
    ).all()
    return [_serialize(session, p) for p in rows]
