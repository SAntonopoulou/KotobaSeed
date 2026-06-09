"""Mark-complete timing gate + no-show transition.

The complete endpoint refuses to fire before `scheduled_at + duration -
5min` (small grace so a tutor can hit the button when they hang up). The
no-show endpoint refuses to fire before `scheduled_at + 15min` (grace
for a late student to actually arrive). Both endpoints are idempotent.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    TutorAccountStatus,
)

from .conftest import auth_headers_for


@pytest.fixture
def active_tutor(db_session: Session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    vasso_tutor.stripe_connect_account_id = "acct_test"
    db_session.add(vasso_tutor)
    teacher_user.timezone = "UTC"
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


def _seed_pack(db_session: Session, tutor, duration=60):
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Single",
        num_lessons=1,
        duration_minutes=duration,
        price_cents=2500,
        currency="eur",
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


def _seed_booking(db_session, tutor, student, pack, scheduled_at):
    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=scheduled_at,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        status=BookingStatus.CONFIRMED,
        stripe_payment_intent_id="pi_test",
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    return booking


# --- mark complete -----------------------------------------------------


def test_complete_rejects_before_lesson_ends(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor)
    # 30-minute lesson starting in 5 minutes — far from done.
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/complete",
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 400
    assert "ends at" in r.json()["detail"].lower()


def test_complete_allowed_within_5min_grace(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=60)
    # Lesson started 56 minutes ago — ends in 4 minutes; grace allows it.
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(minutes=56),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/complete",
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_complete_after_lesson_ends(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=30)
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(hours=2),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/complete",
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_complete_is_idempotent(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=30)
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(hours=2),
    )
    h = {"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)}
    first = client.post(f"/tutor/bookings/{booking.id}/complete", headers=h)
    assert first.status_code == 200
    second = client.post(f"/tutor/bookings/{booking.id}/complete", headers=h)
    assert second.status_code == 200
    assert second.json()["status"] == "completed"


# --- no-show -----------------------------------------------------------


def test_no_show_rejects_before_grace_window(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=60)
    # Lesson started 10 minutes ago — still inside the 15-minute grace.
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(minutes=10),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/no-show",
        json={"reason": "didn't show up"},
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 400
    assert "minutes after start" in r.json()["detail"]


def test_no_show_allowed_after_grace(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=60)
    # Lesson started 20 minutes ago — past the 15-minute grace.
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(minutes=20),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/no-show",
        json={"reason": "didn't show up"},
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "no_show"


def test_no_show_is_idempotent(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor, duration=60)
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(hours=2),
    )
    h = {"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)}
    first = client.post(
        f"/tutor/bookings/{booking.id}/no-show", json={}, headers=h
    )
    assert first.status_code == 200
    second = client.post(
        f"/tutor/bookings/{booking.id}/no-show", json={}, headers=h
    )
    assert second.status_code == 200
    assert second.json()["status"] == "no_show"


def test_no_show_rejects_cancelled_booking(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(hours=2),
    )
    booking.status = BookingStatus.CANCELLED
    db_session.add(booking)
    db_session.commit()
    r = client.post(
        f"/tutor/bookings/{booking.id}/no-show",
        json={},
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 409
    assert "cancelled" in r.json()["detail"].lower()


def test_complete_rejects_no_show_booking(
    client, db_session, active_tutor, student_user, teacher_user
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        datetime.now(UTC) - timedelta(hours=2),
    )
    booking.status = BookingStatus.NO_SHOW
    db_session.add(booking)
    db_session.commit()
    r = client.post(
        f"/tutor/bookings/{booking.id}/complete",
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 409
    assert "no_show" in r.json()["detail"]
