"""Classroom minute quota — tracks per-tutor monthly usage of live lesson
minutes against per-plan caps so Sophia's Daily.co bill stays bounded.

The signal is *scheduled-booking duration*, not actual room minutes. We
chose scheduled over actual because:
- it's known at booking time (gives tutors upfront feedback);
- it doesn't depend on a webhook from Daily.co that might fail silently;
- a typical lesson over-run is small and well bounded by the booking's
  declared duration (Daily.co rooms expire on their own).

Hooks:
- record_booking_minutes on every transition INTO BookingStatus.CONFIRMED
- release_booking_minutes when a CONFIRMED booking moves to CANCELLED /
  REFUNDED. COMPLETED stays counted (the minutes were really consumed).

The TutorMinuteUsageLog rows are tagged via the `source` column with
``booking:<id>`` so we can find + remove them on cancel/refund without
re-deriving the math.
"""

from __future__ import annotations

import contextlib
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from sqlmodel import Session, select

from ..config import settings
from ..models import (
    Booking,
    BookingStatus,
    GroupSession,
    MinutePack,
    SubscriptionTier,
    Tutor,
    TutorMinuteUsageLog,
    TutorTeam,
    User,
)


class QuotaSummary(NamedTuple):
    # `used_minutes` is now the ACTUAL minutes taught this cycle
    # (completed + no-show bookings). Reservations sit in
    # `reserved_minutes` so the bar can render them in a different
    # tone — Sophia called this out explicitly: "used" means used.
    used_minutes: int
    reserved_minutes: int
    quota_minutes: int  # base tier quota (0 = unlimited)
    pack_minutes_available: int  # minutes still available across all packs
    percent_used: int  # used / quota, 0..100
    percent_reserved: int  # used + reserved / quota, 0..100
    period_start: datetime
    period_end: datetime
    next_reset_at: datetime
    plan: SubscriptionTier
    over_quota: bool


def _quota_for_tier(tier: SubscriptionTier) -> int:
    """Solo tier quota in minutes. Use `_effective_quota` instead when
    the caller wants the team-aware pool (which is what every consumer
    in this module ultimately wants).
    """
    table = {
        SubscriptionTier.FREE: settings.minute_quota_free,
        SubscriptionTier.PLUS: settings.minute_quota_plus,
        SubscriptionTier.PRO: settings.minute_quota_pro,
        SubscriptionTier.BUSINESS: settings.minute_quota_business,
    }
    return table.get(tier, settings.minute_quota_free)


def _team_member_tutor_ids(tutor: Tutor | None, session: Session) -> list[int]:
    """If `tutor` is on a team, return every active Tutor.id on that team.
    Otherwise return [tutor.id]. Used to aggregate ledger rows across a
    shared pool — Business teams share their classroom minutes.
    """
    if tutor is None or tutor.id is None:
        return []
    if tutor.team_id is None:
        return [tutor.id]
    members = session.exec(
        select(Tutor.id).where(Tutor.team_id == tutor.team_id)
    ).all()
    # Tuple-ish rows from sqlalchemy unpack as scalars when we select a
    # single column — but be defensive.
    ids = []
    for m in members:
        ids.append(m if isinstance(m, int) else int(m[0] if hasattr(m, "__iter__") else m))
    return ids or [tutor.id]


def _team_for_tutor(tutor: Tutor, session: Session) -> TutorTeam | None:
    if tutor.team_id is None:
        return None
    return session.get(TutorTeam, tutor.team_id)


def _effective_quota(
    tutor: Tutor, user: User, session: Session
) -> int:
    """Effective monthly classroom-minute pool for this tutor.

    - Solo tutor: their own tier quota (0 = unlimited).
    - Team tutor: the team's shared pool — sized from the team owner's
      tier (Business by design) plus a per-seat bonus times the count of
      active seats beyond the first. Every team member draws from this
      same pool; that's the whole point of team billing.
    """
    team = _team_for_tutor(tutor, session)
    if team is None:
        return _quota_for_tier(user.subscription_tier)

    owner = session.get(User, team.owner_user_id)
    base = _quota_for_tier(
        owner.subscription_tier if owner else user.subscription_tier
    )
    if base == 0:
        return 0  # unlimited tier — team scaling is moot

    member_ids = _team_member_tutor_ids(tutor, session)
    seats = max(1, len(member_ids))
    per_seat_bonus = (
        settings.minute_quota_business_per_seat
        if (owner and owner.subscription_tier == SubscriptionTier.BUSINESS)
        else 0
    )
    return base + (seats - 1) * per_seat_bonus


def _month_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Returns [start, end) for the calendar month containing `now` (UTC).

    Quota resets at the start of the next UTC month.
    """
    now = now or datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    last_day = monthrange(now.year, now.month)[1]
    end = datetime(now.year, now.month, last_day, tzinfo=UTC) + timedelta(days=1)
    return start, end


def _booking_source(booking_id: int) -> str:
    return f"booking:{booking_id}"


def _group_session_source(group_session_id: int) -> str:
    """Group sessions consume one room regardless of how many students
    attend, so we tag the session itself, not the per-seat Bookings.
    """
    return f"group_session:{group_session_id}"


def record_booking_minutes(
    booking: Booking, session: Session, *, commit: bool = False
) -> None:
    """Stamp this booking's duration into the usage ledger and consume
    pack minutes if the base tier quota would otherwise be exceeded.

    Idempotent: if a row already exists for this booking, do nothing.
    The TutorMinuteUsageLog row always records the full booking duration;
    MinutePack rows separately track how much of the overflow was paid
    for. The two together give a complete audit trail.
    """
    src = _booking_source(booking.id)
    existing = session.exec(
        select(TutorMinuteUsageLog).where(TutorMinuteUsageLog.source == src)
    ).first()
    if existing is not None:
        return

    minutes = int(booking.duration_minutes or 0)
    log = TutorMinuteUsageLog(
        tutor_id=booking.tutor_id,
        usage_date=booking.scheduled_at or datetime.now(UTC),
        minutes_used=minutes,
        source=src,
    )
    session.add(log)

    # If this booking pushes us past the effective pool (which is the
    # team's shared pool when on a team), deduct from packs.
    tutor = session.get(Tutor, booking.tutor_id)
    if tutor is not None:
        user = session.get(User, tutor.user_id)
        if user is not None:
            quota = _effective_quota(tutor, user, session)
            if quota > 0:
                # Recompute "used so far this month" EXCLUDING the row we
                # just added, so we know if this booking is the one that
                # crosses the line. The simplest way is to look at the
                # current month total before our flush — but since the
                # row is on the pending session it shows up.
                used_now = current_month_minutes(tutor.id, session)
                # `used_now` includes our new row; the value before this
                # booking was `used_now - minutes`. Headroom before the
                # booking: max(0, quota - (used_now - minutes)).
                pre_booking_used = max(0, used_now - minutes)
                base_headroom = max(0, quota - pre_booking_used)
                overflow = max(0, minutes - base_headroom)
                if overflow > 0:
                    _consume_from_packs(tutor.id, overflow, session)

    if commit:
        session.commit()


def release_booking_minutes(
    booking: Booking, session: Session, *, commit: bool = False
) -> None:
    """Remove the usage row for this booking (cancellations / refunds).

    Safe to call even if no row exists.
    """
    src = _booking_source(booking.id)
    rows = session.exec(
        select(TutorMinuteUsageLog).where(TutorMinuteUsageLog.source == src)
    ).all()
    for row in rows:
        session.delete(row)
    if commit:
        session.commit()


def record_group_session_minutes(
    gs: GroupSession, session: Session, *, commit: bool = False
) -> None:
    """Reserve room-minutes for a group session at creation time.

    Idempotent — re-recording the same group_session_id is a no-op.
    """
    src = _group_session_source(gs.id)
    existing = session.exec(
        select(TutorMinuteUsageLog).where(TutorMinuteUsageLog.source == src)
    ).first()
    if existing is not None:
        return
    log = TutorMinuteUsageLog(
        tutor_id=gs.tutor_id,
        usage_date=gs.scheduled_at,
        minutes_used=int(gs.duration_minutes or 0),
        source=src,
    )
    session.add(log)
    if commit:
        session.commit()


def release_group_session_minutes(
    gs: GroupSession, session: Session, *, commit: bool = False
) -> None:
    """Drop the reservation for a group session (auto-refunded, or tutor
    cancelled it). Safe to call without a prior reservation.
    """
    src = _group_session_source(gs.id)
    rows = session.exec(
        select(TutorMinuteUsageLog).where(TutorMinuteUsageLog.source == src)
    ).all()
    for row in rows:
        session.delete(row)
    if commit:
        session.commit()


def current_month_minutes(
    tutor_id: int, session: Session, *, now: datetime | None = None
) -> int:
    """Sum confirmed-booking minutes inside the current UTC month.

    Team-aware: if the tutor is on a team (Business), this aggregates
    across all team members' ledger rows — every seat pulls from the
    same shared pool, so usage is summed before comparing to quota.
    Solo tutors see only their own rows.

    Uses TutorMinuteUsageLog.usage_date (= the lesson's scheduled_at) so a
    booking that paid this week but takes place next month counts against
    next month's quota — matches a tutor's intuition.
    """
    tutor = session.get(Tutor, tutor_id)
    tutor_ids = _team_member_tutor_ids(tutor, session) or [tutor_id]
    start, end = _month_window(now)
    rows = session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.tutor_id.in_(tutor_ids),
            TutorMinuteUsageLog.usage_date >= start,
            TutorMinuteUsageLog.usage_date < end,
        )
    ).all()
    return sum(int(r.minutes_used or 0) for r in rows)


def _split_month_minutes_by_status(
    tutor_id: int, session: Session, *, now: datetime | None = None
) -> tuple[int, int]:
    """Return (actual_used, reserved) — minutes already taught in
    completed lessons vs. minutes reserved by upcoming confirmed
    bookings inside the current UTC month.

    Team-aware: aggregates across all team members when the tutor is
    on a team, so the dashboard widget shows the same shared pool the
    quota check uses.

    "Actual" lets the dashboard widget answer "how much have I taught
    so far" honestly, instead of conflating reservations with delivery.
    NO_SHOW counts as actual usage because the tutor's time was held;
    cancelled / refunded rows are already removed from the ledger by
    `release_booking_minutes`.
    """
    tutor = session.get(Tutor, tutor_id)
    tutor_ids = _team_member_tutor_ids(tutor, session) or [tutor_id]
    start, end = _month_window(now)
    rows = session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.tutor_id.in_(tutor_ids),
            TutorMinuteUsageLog.usage_date >= start,
            TutorMinuteUsageLog.usage_date < end,
        )
    ).all()
    if not rows:
        return (0, 0)

    booking_ids: list[int] = []
    group_session_ids: list[int] = []
    by_source: dict[str, int] = {}
    for r in rows:
        m = int(r.minutes_used or 0)
        by_source[r.source] = by_source.get(r.source, 0) + m
        if (r.source or "").startswith("booking:"):
            with contextlib.suppress(ValueError):
                booking_ids.append(int(r.source.split(":", 1)[1]))
        elif (r.source or "").startswith("group_session:"):
            with contextlib.suppress(ValueError):
                group_session_ids.append(int(r.source.split(":", 1)[1]))

    booking_status_by_id: dict[int, BookingStatus] = {}
    if booking_ids:
        for b in session.exec(
            select(Booking).where(Booking.id.in_(booking_ids))
        ).all():
            booking_status_by_id[b.id] = b.status

    # A group session is "delivered" when either delivered_at is
    # stamped (an explicit cron / tutor action) or its scheduled
    # window has already elapsed. The implicit check means we don't
    # need a separate cron just to make the minute meter honest.
    now_utc = datetime.now(UTC)
    group_session_delivered: dict[int, bool] = {}
    if group_session_ids:
        for gs in session.exec(
            select(GroupSession).where(GroupSession.id.in_(group_session_ids))
        ).all():
            scheduled = gs.scheduled_at
            if scheduled.tzinfo is None:
                scheduled = scheduled.replace(tzinfo=UTC)
            session_end = scheduled + timedelta(minutes=int(gs.duration_minutes or 0))
            group_session_delivered[gs.id] = (
                gs.delivered_at is not None or session_end <= now_utc
            )

    actual = 0
    reserved = 0
    for source, minutes in by_source.items():
        if source.startswith("booking:"):
            try:
                bid = int(source.split(":", 1)[1])
            except ValueError:
                reserved += minutes
                continue
            st = booking_status_by_id.get(bid)
            # COMPLETED + NO_SHOW = the room was actually used (the
            # tutor showed up either way). Anything else still in the
            # ledger is a future reservation.
            if st in (BookingStatus.COMPLETED, BookingStatus.NO_SHOW):
                actual += minutes
            else:
                reserved += minutes
        elif source.startswith("group_session:"):
            try:
                gsid = int(source.split(":", 1)[1])
            except ValueError:
                reserved += minutes
                continue
            if group_session_delivered.get(gsid, False):
                actual += minutes
            else:
                reserved += minutes
        else:
            reserved += minutes
    return (actual, reserved)


def pack_minutes_available(tutor_id: int, session: Session) -> int:
    """Sum of unused minutes across every active MinutePack for this tutor."""
    rows = session.exec(
        select(MinutePack).where(
            MinutePack.tutor_id == tutor_id,
            MinutePack.minutes_remaining > 0,
        )
    ).all()
    return sum(int(r.minutes_remaining or 0) for r in rows)


def would_exceed_quota(
    tutor: Tutor, user: User, additional_minutes: int, session: Session
) -> bool:
    """Returns True if adding `additional_minutes` to the current month's
    usage would exceed the tutor's effective quota (tier quota + any
    unused minute-pack credits).

    Business with quota=0 means unlimited.
    """
    quota = _quota_for_tier(user.subscription_tier)
    if quota <= 0:
        return False
    used = current_month_minutes(tutor.id, session)
    base_headroom = max(0, quota - used)
    if additional_minutes <= base_headroom:
        return False
    # We'd dip into pack credits — check if the packs have enough left.
    overflow = additional_minutes - base_headroom
    return overflow > pack_minutes_available(tutor.id, session)


def _consume_from_packs(tutor_id: int, minutes: int, session: Session) -> int:
    """Deduct `minutes` from the tutor's MinutePack rows FIFO (oldest first).

    Returns the number of minutes successfully consumed (may be less than
    requested if packs run out — caller decides what to do with the gap).
    """
    if minutes <= 0:
        return 0
    rows = session.exec(
        select(MinutePack)
        .where(
            MinutePack.tutor_id == tutor_id,
            MinutePack.minutes_remaining > 0,
        )
        .order_by(MinutePack.purchased_at.asc())
    ).all()
    now = datetime.now(UTC)
    consumed = 0
    for row in rows:
        if consumed >= minutes:
            break
        take = min(int(row.minutes_remaining or 0), minutes - consumed)
        row.minutes_remaining = int(row.minutes_remaining) - take
        row.last_used_at = now
        session.add(row)
        consumed += take
    return consumed


def quota_summary(tutor: Tutor, user: User, session: Session) -> QuotaSummary:
    """Snapshot for the dashboard widget + API consumers.

    `used_minutes` is now actual minutes taught (COMPLETED + NO_SHOW —
    the tutor's room was held in either case). `reserved_minutes` is
    upcoming confirmed bookings still ahead of them. Sophia's UI shows
    the bar with reserved in a lighter tone behind used so a tutor can
    see at a glance what they've delivered vs. what's still on the books.
    """
    actual, reserved = _split_month_minutes_by_status(tutor.id, session)
    quota = _effective_quota(tutor, user, session)
    packs = pack_minutes_available(tutor.id, session)
    start, end = _month_window()
    percent_used = 0
    percent_reserved = 0
    if quota > 0:
        percent_used = min(100, int(round((actual / quota) * 100)))
        percent_reserved = min(
            100, int(round(((actual + reserved) / quota) * 100))
        )
    return QuotaSummary(
        used_minutes=actual,
        reserved_minutes=reserved,
        quota_minutes=quota,
        pack_minutes_available=packs,
        percent_used=percent_used,
        percent_reserved=percent_reserved,
        period_start=start,
        period_end=end,
        next_reset_at=end,
        plan=user.subscription_tier,
        # We still warn "over quota" once reservations plus actual cross
        # the line — the capacity decision needs to account for what's
        # already on the calendar.
        over_quota=(
            quota > 0
            and (actual + reserved) >= quota
            and packs == 0
        ),
    )
