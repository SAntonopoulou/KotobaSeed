"""Recurring lesson plans → child Booking generation.

A `RecurringBookingPlan` represents a standing weekly slot a student has
reserved with a tutor. The plan itself doesn't bill — it spawns child
`Booking` rows on a rolling horizon (default 4 weeks ahead), each billed
individually via the normal Stripe Checkout flow.

Cron responsibilities (run daily):
- For every ACTIVE plan, ensure `lookahead_weeks` future bookings exist
- For every PENDING_PAYMENT booking older than the cancellation cutoff,
  flip to CANCELLED so the slot frees up

Cancelling a plan stops generation but leaves already-generated bookings
alone — the student can still pay for them, or let them auto-cancel.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time, timedelta

from sqlmodel import Session, select

from ..models import (
    Booking,
    BookingStatus,
    LessonPack,
    RecurringBookingPlan,
    Tutor,
    User,
)

log = logging.getLogger(__name__)


def _next_occurrence(plan: RecurringBookingPlan, *, after: datetime) -> datetime:
    """Return the next slot timestamp for `plan` strictly later than `after`.

    `start_minute` is minutes from midnight UTC; the day-of-week resolution
    is also UTC. The frontend translates to/from the tutor's local timezone
    before calling create.
    """
    target_dow = plan.day_of_week
    base = after.astimezone(UTC) if after.tzinfo else after.replace(tzinfo=UTC)
    days_ahead = (target_dow - base.weekday()) % 7
    candidate = datetime.combine(
        base.date() + timedelta(days=days_ahead),
        time(hour=plan.start_minute // 60, minute=plan.start_minute % 60),
        tzinfo=UTC,
    )
    if candidate <= base:
        candidate += timedelta(days=7)
    return candidate


def _existing_future_bookings(
    session: Session, plan: RecurringBookingPlan
) -> list[Booking]:
    now = datetime.now(UTC)
    return list(
        session.exec(
            select(Booking)
            .where(
                Booking.recurring_plan_id == plan.id,
                Booking.scheduled_at > now,
                Booking.status.in_(
                    [
                        BookingStatus.PENDING_PAYMENT,
                        BookingStatus.CONFIRMED,
                        BookingStatus.COMPLETED,
                    ]
                ),
            )
            .order_by(Booking.scheduled_at)
        ).all()
    )


def generate_bookings_for_plan(
    session: Session, plan: RecurringBookingPlan
) -> int:
    """Ensure `plan.lookahead_weeks` future bookings exist. Returns the
    number newly created. Idempotent — calling repeatedly is fine."""
    if plan.status != "active":
        return 0
    existing = _existing_future_bookings(session, plan)
    needed = plan.lookahead_weeks - len(existing)
    if needed <= 0:
        return 0

    pack = session.get(LessonPack, plan.lesson_pack_id)
    if pack is None or not pack.is_active or pack.is_group:
        log.warning(
            "Recurring plan %s references invalid pack %s; skipping",
            plan.id,
            plan.lesson_pack_id,
        )
        return 0
    tutor = session.get(Tutor, plan.tutor_id)
    if tutor is None:
        return 0
    tutor_user = session.get(User, tutor.user_id)
    if tutor_user is None:
        return 0

    # Platform fee per lesson — recurring shares the 1:1 lesson fee table.
    from .platform_fees import lesson_platform_fee

    fee_cents = lesson_platform_fee(tutor_user, plan.price_cents)

    # Anchor: either the last generated slot or the plan's start_date,
    # whichever is later. We always step forward in weekly hops.
    if existing:
        last = existing[-1].scheduled_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        anchor = last
    else:
        anchor = plan.start_date
        if anchor.tzinfo is None:
            anchor = anchor.replace(tzinfo=UTC)
        # Move anchor backwards one period so _next_occurrence finds the
        # correct first slot (>= start_date).
        anchor -= timedelta(days=7, seconds=1)

    created = 0
    now = datetime.now(UTC)
    # Earliest acceptable slot: the later of the tutor's booking lead
    # time and the cancellation cutoff. Recurring plans that anchor to
    # "tomorrow 9am" used to slip a child through ahead of either gate
    # at generation time — close to the lesson, the student would see
    # an unpaid PENDING_PAYMENT row and the tutor would have lost prep
    # time to reshuffle. Skip those slots; the next `lookahead_weeks`
    # tick will pick them up once they're far enough out.
    lead_min = getattr(tutor, "min_booking_lead_minutes", 0) or 0
    cutoff_hours = getattr(tutor, "cancellation_cutoff_hours", 0) or 0
    earliest_acceptable = now + max(
        timedelta(minutes=lead_min),
        timedelta(hours=cutoff_hours),
    )
    # Fast-forward the anchor so the loop doesn't spin through years of
    # weekly increments when the plan's start_date is far in the past
    # (e.g. a long-running plan whose tutor recently bumped the lead
    # time). One week back of the earliest acceptable slot is enough
    # padding for `_next_occurrence` to still land on the right
    # weekday/time for the very first emitted booking.
    if anchor < earliest_acceptable - timedelta(weeks=1):
        anchor = earliest_acceptable - timedelta(weeks=1)
    while created < needed:
        next_slot = _next_occurrence(plan, after=anchor)
        if next_slot <= now or next_slot < earliest_acceptable:
            anchor = next_slot
            continue
        # Skip slots that already have a refunded/cancelled child so we
        # don't immediately re-create what the student just cancelled.
        clash = session.exec(
            select(Booking).where(
                Booking.recurring_plan_id == plan.id,
                Booking.scheduled_at == next_slot,
            )
        ).first()
        if clash is not None:
            anchor = next_slot
            continue
        # Also skip if any other booking owns this slot for the tutor —
        # avoids creating overlapping reservations.
        overlap = session.exec(
            select(Booking).where(
                Booking.tutor_id == plan.tutor_id,
                Booking.scheduled_at == next_slot,
                Booking.status.in_(
                    [
                        BookingStatus.PENDING_PAYMENT,
                        BookingStatus.PENDING_GROUP_MIN,
                        BookingStatus.CONFIRMED,
                    ]
                ),
            )
        ).first()
        if overlap is not None:
            anchor = next_slot
            continue
        # Stamp team_id at booking time so the non-compete protection has
        # a faithful audit trail even if the tutor later leaves the team.
        tutor_for_team = session.get(Tutor, plan.tutor_id)
        booking = Booking(
            tutor_id=plan.tutor_id,
            student_user_id=plan.student_user_id,
            lesson_pack_id=plan.lesson_pack_id,
            recurring_plan_id=plan.id,
            tutor_team_id=tutor_for_team.team_id if tutor_for_team else None,
            scheduled_at=next_slot,
            duration_minutes=plan.duration_minutes,
            price_cents=plan.price_cents,
            currency=plan.currency,
            platform_fee_cents=fee_cents,
            status=BookingStatus.PENDING_PAYMENT,
        )
        session.add(booking)
        created += 1
        anchor = next_slot
    if created:
        # Recurring plans imply enrollment — make sure it's recorded.
        from . import enrollment as _enroll
        _enroll.ensure_enrollment(
            student_user_id=plan.student_user_id,
            tutor_id=plan.tutor_id,
            session=session,
        )
        session.commit()
    return created


def sweep_active_plans(session: Session) -> int:
    """Generate future bookings for every active plan. Returns total
    bookings newly created across the run."""
    plans = list(
        session.exec(
            select(RecurringBookingPlan).where(
                RecurringBookingPlan.status == "active"
            )
        ).all()
    )
    n = 0
    for plan in plans:
        try:
            n += generate_bookings_for_plan(session, plan)
        except Exception:
            log.exception("Failed to generate bookings for plan %s", plan.id)
    return n


def sweep_expire_unpaid(
    session: Session, *, cutoff_hours: int = 48
) -> int:
    """Cancel PENDING_PAYMENT recurring bookings whose lesson starts
    within `cutoff_hours`. Frees the slot for someone else, removes the
    illusion of a reserved-but-unpaid slot. Returns the cancellation
    count."""
    now = datetime.now(UTC)
    threshold = now + timedelta(hours=cutoff_hours)
    rows = list(
        session.exec(
            select(Booking).where(
                Booking.recurring_plan_id.is_not(None),
                Booking.status == BookingStatus.PENDING_PAYMENT,
                Booking.scheduled_at <= threshold,
                Booking.scheduled_at > now,
            )
        ).all()
    )
    n = 0
    for booking in rows:
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = now
        booking.updated_at = now
        session.add(booking)
        n += 1
    if n:
        session.commit()
    return n
