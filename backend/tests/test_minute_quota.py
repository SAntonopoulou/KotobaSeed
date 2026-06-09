"""Classroom minute quota — the cost cap that protects Sophia from
unbounded Daily.co bills if a Free tutor schedules 1000 hours of lessons.

Quotas are keyed off User.subscription_tier. The flow:
- record_booking_minutes on every CONFIRMED transition
- release_booking_minutes when CONFIRMED → CANCELLED/REFUNDED
- COMPLETED stays counted (lesson really happened)
- would_exceed_quota gate on booking checkout

These tests cover the service layer + the booking-checkout 402 path.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session, select

from backend.models import (
    Booking,
    BookingStatus,
    GroupSession,
    LessonPack,
    SubscriptionTier,
    Tutor,
    TutorMinuteUsageLog,
    User,
)
from backend.services import minute_quota

HOST = {"Host": "vasso.localhost"}


# -- Service layer -------------------------------------------------------


def _ensure_pack(session: Session, tutor: Tutor) -> LessonPack:
    pack = session.exec(
        select(LessonPack).where(LessonPack.tutor_id == tutor.id)
    ).first()
    if pack is not None:
        return pack
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Test pack",
        num_lessons=1,
        duration_minutes=60,
        price_cents=1000,
        currency="eur",
        is_active=True,
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    return pack


def _make_booking(
    *, session: Session, tutor: Tutor, student: User, when: datetime, duration: int
) -> Booking:
    pack = _ensure_pack(session, tutor)
    return Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=when,
        duration_minutes=duration,
        price_cents=1000,
        currency="eur",
        platform_fee_cents=0,
        status=BookingStatus.CONFIRMED,
    )


def test_record_then_release_is_idempotent(
    db_session: Session, vasso_tutor: Tutor, student_user: User
):
    booking = _make_booking(
        session=db_session, tutor=vasso_tutor,
        student=student_user,
        when=datetime(2026, 6, 15, 14, 0, tzinfo=UTC),
        duration=60,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    minute_quota.record_booking_minutes(booking, db_session, commit=True)
    minute_quota.record_booking_minutes(booking, db_session, commit=True)

    rows = db_session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.source == f"booking:{booking.id}"
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].minutes_used == 60

    minute_quota.release_booking_minutes(booking, db_session, commit=True)
    rows = db_session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.source == f"booking:{booking.id}"
        )
    ).all()
    assert len(rows) == 0


def test_current_month_minutes_respects_window(
    db_session: Session, vasso_tutor: Tutor, student_user: User
):
    now = datetime(2026, 6, 15, 12, 0, tzinfo=UTC)
    in_window = _make_booking(
        session=db_session, tutor=vasso_tutor, student=student_user, when=now, duration=90
    )
    last_month = _make_booking(
        session=db_session, tutor=vasso_tutor,
        student=student_user,
        when=datetime(2026, 5, 20, 12, 0, tzinfo=UTC),
        duration=60,
    )
    next_month = _make_booking(
        session=db_session, tutor=vasso_tutor,
        student=student_user,
        when=datetime(2026, 7, 5, 12, 0, tzinfo=UTC),
        duration=45,
    )
    for b in (in_window, last_month, next_month):
        db_session.add(b)
    db_session.commit()
    for b in (in_window, last_month, next_month):
        db_session.refresh(b)
        minute_quota.record_booking_minutes(b, db_session)
    db_session.commit()

    used = minute_quota.current_month_minutes(vasso_tutor.id, db_session, now=now)
    assert used == 90


def test_would_exceed_quota_blocks_at_cap(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    """Free tier quota is 240 by default; 4x 60-min bookings sit at the cap."""
    teacher_user.subscription_tier = SubscriptionTier.FREE
    db_session.add(teacher_user)
    db_session.commit()

    now = datetime.now(UTC).replace(day=10, hour=12, minute=0, second=0, microsecond=0)
    for hour_offset in range(4):
        b = _make_booking(
        session=db_session, tutor=vasso_tutor,
            student=student_user,
            when=now.replace(hour=10 + hour_offset),
            duration=60,
        )
        db_session.add(b)
        db_session.commit()
        db_session.refresh(b)
        minute_quota.record_booking_minutes(b, db_session)
    db_session.commit()

    assert minute_quota.current_month_minutes(vasso_tutor.id, db_session) == 240
    assert minute_quota.would_exceed_quota(
        vasso_tutor, teacher_user, 30, db_session
    ) is True


def test_business_plan_is_unlimited(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    teacher_user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(teacher_user)
    db_session.commit()

    # Pile on minutes — Business cap is 0 (unlimited).
    for d in range(1, 25):
        b = _make_booking(
        session=db_session, tutor=vasso_tutor,
            student=student_user,
            when=datetime.now(UTC).replace(day=d, hour=10),
            duration=240,
        )
        db_session.add(b)
        db_session.commit()
        db_session.refresh(b)
        minute_quota.record_booking_minutes(b, db_session)
    db_session.commit()
    assert minute_quota.would_exceed_quota(
        vasso_tutor, teacher_user, 60, db_session
    ) is False


def test_group_session_minutes_release_on_min_not_met(
    db_session: Session, vasso_tutor: Tutor
):
    gs = GroupSession(
        tutor_id=vasso_tutor.id,
        lesson_pack_id=0,
        scheduled_at=datetime.now(UTC).replace(day=20, hour=18),
        duration_minutes=90,
        threshold_eval_at=datetime.now(UTC),
    )
    db_session.add(gs)
    db_session.commit()
    db_session.refresh(gs)

    minute_quota.record_group_session_minutes(gs, db_session, commit=True)
    rows = db_session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.source == f"group_session:{gs.id}"
        )
    ).all()
    assert len(rows) == 1 and rows[0].minutes_used == 90

    minute_quota.release_group_session_minutes(gs, db_session, commit=True)
    rows = db_session.exec(
        select(TutorMinuteUsageLog).where(
            TutorMinuteUsageLog.source == f"group_session:{gs.id}"
        )
    ).all()
    assert rows == []


# -- HTTP — quota gates the booking checkout ----------------------------


def test_booking_checkout_rejects_when_quota_exhausted(
    client, vasso_tutor, teacher_user, student_user, db_session
):
    """When the tutor is already at quota, /tutor/lesson-packs/:id/checkout
    returns 402 before creating the Stripe Checkout session."""
    teacher_user.subscription_tier = SubscriptionTier.FREE
    vasso_tutor.stripe_connect_account_id = "acct_test_quota"
    db_session.add(teacher_user)
    db_session.add(vasso_tutor)
    # Slot validation needs an availability window; without one the
    # endpoint returns 400 ("This time isn't open") before getting to
    # the quota gate this test exercises.
    from backend.models import TutorAvailability
    for weekday in range(7):
        db_session.add(
            TutorAvailability(
                tutor_id=vasso_tutor.id,
                weekday=weekday,
                start_minute=0,
                end_minute=1440,
            )
        )
    db_session.commit()

    pack = LessonPack(
        tutor_id=vasso_tutor.id,
        name="Single 60",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2000,
        currency="eur",
        is_active=True,
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)

    # Fill the Free cap (240 min) ahead of time.
    for d in range(1, 5):
        b = _make_booking(
        session=db_session, tutor=vasso_tutor,
            student=student_user,
            when=datetime.now(UTC).replace(day=d, hour=10),
            duration=60,
        )
        db_session.add(b)
        db_session.commit()
        db_session.refresh(b)
        minute_quota.record_booking_minutes(b, db_session)
    db_session.commit()

    from backend.tests.conftest import auth_headers_for

    future = datetime.now(UTC).replace(day=28, hour=14, minute=0, second=0, microsecond=0)
    r = client.post(
        f"/tutor/lesson-packs/{pack.id}/book",
        json={"scheduled_at": future.isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 402
    assert "month" in r.json()["detail"].lower()
