"""Tutor business analytics — revenue, lessons, students, trends."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    TutorAccountStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


@pytest.fixture
def active_tutor(db_session: Session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


def _make_pack(db_session: Session, tutor, *, is_trial=False, price=2500, duration=60):
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Single" if not is_trial else "Trial",
        num_lessons=1,
        duration_minutes=duration,
        price_cents=price if not is_trial else 0,
        currency="eur",
        is_trial=is_trial,
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


def _make_student(db_session: Session, email: str) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=email.split("@")[0].title(),
        role=UserRole.STUDENT,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _booking(
    db_session: Session,
    tutor,
    student,
    pack,
    *,
    status: BookingStatus,
    scheduled_at: datetime,
    completed_at: datetime | None = None,
    platform_fee_cents: int = 0,
    created_at: datetime | None = None,
):
    b = Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=scheduled_at,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        platform_fee_cents=platform_fee_cents,
        status=status,
        completed_at=completed_at,
        created_at=created_at or datetime.now(UTC),
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


# --- Auth + shape ----------------------------------------------------


def test_analytics_requires_owner(client, active_tutor, student_user):
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_analytics_empty_tutor_returns_zeroes(client, active_tutor, teacher_user):
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["current_month"]["revenue_cents"] == 0
    assert body["current_month"]["lessons_completed"] == 0
    assert body["current_month"]["new_students"] == 0
    assert body["lifetime"]["total_students"] == 0
    assert body["lifetime"]["trial_to_paid_conversion_rate"] is None
    assert body["upcoming"]["confirmed_count"] == 0
    # Six months of buckets, all zero.
    assert len(body["monthly_trend"]) == 6
    assert all(p["revenue_cents"] == 0 for p in body["monthly_trend"])


# --- Revenue + lessons this month -----------------------------------


def test_revenue_counts_completed_only(client, active_tutor, teacher_user, db_session):
    pack = _make_pack(db_session, active_tutor, price=3000)
    s1 = _make_student(db_session, "s1@example.com")
    s2 = _make_student(db_session, "s2@example.com")
    s3 = _make_student(db_session, "s3@example.com")
    now = datetime.now(UTC)
    # Completed this month → counts. Platform fee 5% (150 cents) → tutor nets 2850.
    _booking(
        db_session, active_tutor, s1, pack,
        status=BookingStatus.COMPLETED,
        scheduled_at=now - timedelta(days=2),
        completed_at=now - timedelta(days=2),
        platform_fee_cents=150,
    )
    # Confirmed in the future → pipeline, NOT revenue yet.
    _booking(
        db_session, active_tutor, s2, pack,
        status=BookingStatus.CONFIRMED,
        scheduled_at=now + timedelta(days=3),
    )
    # Refunded → never counts.
    _booking(
        db_session, active_tutor, s3, pack,
        status=BookingStatus.REFUNDED,
        scheduled_at=now - timedelta(days=10),
        completed_at=now - timedelta(days=10),
    )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    cm = r.json()["current_month"]
    assert cm["revenue_cents"] == 2850
    assert cm["lessons_completed"] == 1
    assert cm["hours_taught"] == 1.0


def test_revenue_excludes_earlier_months(client, active_tutor, teacher_user, db_session):
    pack = _make_pack(db_session, active_tutor, price=4000)
    student = _make_student(db_session, "old@example.com")
    # Completed three months ago — must not contribute to this month's revenue.
    old_month = (datetime.now(UTC).replace(day=1) - timedelta(days=60))
    _booking(
        db_session, active_tutor, student, pack,
        status=BookingStatus.COMPLETED,
        scheduled_at=old_month,
        completed_at=old_month,
    )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["current_month"]["revenue_cents"] == 0


# --- New students this month ----------------------------------------


def test_new_students_counts_first_booking_only(
    client, active_tutor, teacher_user, db_session
):
    pack = _make_pack(db_session, active_tutor)
    returning = _make_student(db_session, "returning@example.com")
    fresh = _make_student(db_session, "fresh@example.com")
    now = datetime.now(UTC)
    # Returning student's first booking was way before this month.
    long_ago = now - timedelta(days=120)
    _booking(
        db_session, active_tutor, returning, pack,
        status=BookingStatus.COMPLETED,
        scheduled_at=long_ago,
        completed_at=long_ago,
        created_at=long_ago,
    )
    # And they booked again this month — still not "new".
    _booking(
        db_session, active_tutor, returning, pack,
        status=BookingStatus.CONFIRMED,
        scheduled_at=now + timedelta(days=2),
        created_at=now - timedelta(days=1),
    )
    # Fresh student's first paid booking is this month.
    _booking(
        db_session, active_tutor, fresh, pack,
        status=BookingStatus.CONFIRMED,
        scheduled_at=now + timedelta(days=5),
        created_at=now - timedelta(days=1),
    )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["current_month"]["new_students"] == 1


# --- Conversion rate ------------------------------------------------


def test_conversion_rate_counts_trial_to_paid(
    client, active_tutor, teacher_user, db_session
):
    paid_pack = _make_pack(db_session, active_tutor)
    trial_pack = _make_pack(db_session, active_tutor, is_trial=True)
    now = datetime.now(UTC)
    # Three students take a trial; two of them go on to book a paid lesson.
    converted_a = _make_student(db_session, "a@example.com")
    converted_b = _make_student(db_session, "b@example.com")
    only_trial = _make_student(db_session, "c@example.com")
    for s in (converted_a, converted_b, only_trial):
        _booking(
            db_session, active_tutor, s, trial_pack,
            status=BookingStatus.CONFIRMED,
            scheduled_at=now + timedelta(days=2),
        )
    for s in (converted_a, converted_b):
        _booking(
            db_session, active_tutor, s, paid_pack,
            status=BookingStatus.CONFIRMED,
            scheduled_at=now + timedelta(days=10),
        )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["lifetime"]["trial_to_paid_conversion_rate"] == 0.667


def test_conversion_null_when_no_trials(
    client, active_tutor, teacher_user, db_session
):
    pack = _make_pack(db_session, active_tutor)
    s = _make_student(db_session, "x@example.com")
    _booking(
        db_session, active_tutor, s, pack,
        status=BookingStatus.CONFIRMED,
        scheduled_at=datetime.now(UTC) + timedelta(days=3),
    )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["lifetime"]["trial_to_paid_conversion_rate"] is None


# --- Repeat students -----------------------------------------------


def test_repeat_students_counts_2_plus_paid_bookings(
    client, active_tutor, teacher_user, db_session
):
    pack = _make_pack(db_session, active_tutor)
    once = _make_student(db_session, "once@example.com")
    twice = _make_student(db_session, "twice@example.com")
    now = datetime.now(UTC)
    _booking(db_session, active_tutor, once, pack, status=BookingStatus.COMPLETED,
             scheduled_at=now - timedelta(days=5), completed_at=now - timedelta(days=5))
    for offset in (5, 15):
        _booking(
            db_session, active_tutor, twice, pack,
            status=BookingStatus.COMPLETED,
            scheduled_at=now - timedelta(days=offset),
            completed_at=now - timedelta(days=offset),
        )
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["lifetime"]["total_students"] == 2
    assert r.json()["lifetime"]["repeat_students"] == 1


# --- Upcoming --------------------------------------------------------


def test_upcoming_split_by_window(client, active_tutor, teacher_user, db_session):
    pack = _make_pack(db_session, active_tutor)
    s = _make_student(db_session, "u@example.com")
    now = datetime.now(UTC)
    _booking(db_session, active_tutor, s, pack, status=BookingStatus.CONFIRMED,
             scheduled_at=now + timedelta(days=2))
    _booking(db_session, active_tutor, s, pack, status=BookingStatus.CONFIRMED,
             scheduled_at=now + timedelta(days=4))
    _booking(db_session, active_tutor, s, pack, status=BookingStatus.CONFIRMED,
             scheduled_at=now + timedelta(days=14))
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    up = r.json()["upcoming"]
    assert up["confirmed_count"] == 3
    assert up["next_7_days"] == 2


# --- Monthly trend ---------------------------------------------------


def test_monthly_trend_six_buckets_chronological(
    client, active_tutor, teacher_user, db_session
):
    r = client.get(
        "/tutor/analytics",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    trend = r.json()["monthly_trend"]
    assert len(trend) == 6
    # Last bucket is the current month; earlier ones are older.
    months = [p["month"] for p in trend]
    assert months == sorted(months)
