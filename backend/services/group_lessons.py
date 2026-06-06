"""Group lesson evaluation + refund helpers.

The hourly cron sweeps GroupSessions whose `threshold_eval_at` has passed
and decides:
- If `seats_filled >= min_students` → flip every PENDING_GROUP_MIN booking
  to CONFIRMED, email students that it's on.
- If `seats_filled <  min_students` → refund every paid booking, mark the
  session is_cancelled=True, email students.

Either way we stamp `min_evaluated_at` so the sweep is idempotent.
"""

from __future__ import annotations

import contextlib
import logging
import os
from datetime import UTC, datetime
from typing import Iterable

import stripe
from sqlmodel import Session, select

from ..models import Booking, BookingStatus, GroupSession, LessonPack, Tutor, User

log = logging.getLogger(__name__)


def _alive_bookings(session: Session, gs: GroupSession) -> list[Booking]:
    return list(
        session.exec(
            select(Booking).where(
                Booking.group_session_id == gs.id,
                Booking.status.in_(
                    [
                        BookingStatus.PENDING_GROUP_MIN,
                        BookingStatus.CONFIRMED,
                    ]
                ),
            )
        ).all()
    )


def _refund_one(booking: Booking) -> bool:
    """Best-effort Stripe refund. Returns True on success or skip (free /
    no payment_intent). False on Stripe error.
    """
    if booking.price_cents == 0 or not booking.stripe_payment_intent_id:
        return True
    try:
        stripe.Refund.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            payment_intent=booking.stripe_payment_intent_id,
            reverse_transfer=True,
            refund_application_fee=True,
        )
        return True
    except stripe.error.StripeError:
        log.exception(
            "Stripe refund failed for booking %s in group session %s",
            booking.id,
            booking.group_session_id,
        )
        return False


def refund_session_bookings(
    session: Session, gs: GroupSession, *, reason: str
) -> int:
    """Refund every alive booking on this session and flip them to REFUNDED.
    Used both by the minimum-not-met cron path and by the tutor-cancel
    endpoint. Returns the count actually refunded.
    """
    now = datetime.now(UTC)
    refunded = 0
    for booking in _alive_bookings(session, gs):
        if _refund_one(booking):
            booking.status = BookingStatus.REFUNDED
            booking.refunded_at = now
            booking.cancelled_at = now
            booking.updated_at = now
            session.add(booking)
            refunded += 1
    log.info(
        "Refunded %s bookings on group session %s (reason=%s)",
        refunded,
        gs.id,
        reason,
    )
    return refunded


def _confirm_bookings(session: Session, gs: GroupSession) -> int:
    """Flip every PENDING_GROUP_MIN booking on this session to CONFIRMED.
    Idempotent — already-CONFIRMED bookings are skipped."""
    now = datetime.now(UTC)
    n = 0
    for booking in _alive_bookings(session, gs):
        if booking.status == BookingStatus.PENDING_GROUP_MIN:
            booking.status = BookingStatus.CONFIRMED
            booking.updated_at = now
            session.add(booking)
            n += 1
    return n


def evaluate_session(session: Session, gs: GroupSession) -> dict:
    """Run the min-evaluation decision for a single session. Returns a
    summary dict suitable for logging."""
    pack = session.get(LessonPack, gs.lesson_pack_id)
    if pack is None or pack.min_students is None or pack.max_students is None:
        log.warning("Group session %s missing pack/threshold; skipping", gs.id)
        return {"id": gs.id, "result": "skipped_invalid_pack"}

    alive = _alive_bookings(session, gs)
    count = len(alive)
    now = datetime.now(UTC)
    if count >= pack.min_students:
        confirmed = _confirm_bookings(session, gs)
        gs.min_evaluated_at = now
        gs.updated_at = now
        session.add(gs)
        return {
            "id": gs.id,
            "result": "confirmed",
            "seats": count,
            "newly_confirmed": confirmed,
        }
    # Minimum not met — cancel + refund everyone.
    refunded = refund_session_bookings(session, gs, reason="min_not_met")
    gs.is_cancelled = True
    gs.min_evaluated_at = now
    gs.updated_at = now
    session.add(gs)
    return {
        "id": gs.id,
        "result": "cancelled_min_not_met",
        "seats": count,
        "refunded": refunded,
    }


def sweep_due_evaluations(session: Session, *, now: datetime | None = None) -> int:
    """Find every GroupSession whose threshold has passed but hasn't been
    evaluated. Runs the decision per session. Returns the count evaluated.

    Safe to call repeatedly (the `min_evaluated_at` stamp dedupes).
    """
    now = now or datetime.now(UTC)
    rows = session.exec(
        select(GroupSession).where(
            GroupSession.threshold_eval_at <= now,
            GroupSession.min_evaluated_at.is_(None),
            GroupSession.is_cancelled.is_(False),
        )
    ).all()
    n = 0
    for gs in rows:
        with contextlib.suppress(Exception):
            summary = evaluate_session(session, gs)
            log.info("Group session evaluation: %s", summary)
            n += 1
    if n:
        session.commit()
    return n
