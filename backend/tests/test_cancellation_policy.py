"""Cancellation cutoff + reschedule flow.

Covers the platform floor (48h, never weaker), tutor-side stricter
windows, the public /tutor/policy endpoint, and reschedule semantics
(both the existing-booking-cutoff check and the new-slot-cutoff check).
Stripe is stubbed for refunds — tests use BookingStatus directly.
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
    TutorAvailability,
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


def _seed_window_for(db_session: Session, tutor, when: datetime):
    db_session.add(
        TutorAvailability(
            tutor_id=tutor.id,
            weekday=when.weekday(),
            start_minute=0,
            end_minute=1440,
            allow_trial=False,
        )
    )
    db_session.commit()


def _seed_booking(db_session, tutor, student_user, pack, scheduled_at, status=BookingStatus.CONFIRMED):
    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=student_user.id,
        lesson_pack_id=pack.id,
        scheduled_at=scheduled_at,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        status=status,
        stripe_payment_intent_id="pi_test",
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    return booking


# --- Policy endpoint ---------------------------------------------------


def test_policy_endpoint_returns_default_48(client, active_tutor):
    r = client.get("/tutor/policy", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200
    assert r.json()["cancellation_cutoff_hours"] == 48


def test_policy_reflects_tutor_setting(client, active_tutor, teacher_user, db_session):
    active_tutor.cancellation_cutoff_hours = 168
    db_session.add(active_tutor)
    db_session.commit()
    r = client.get("/tutor/policy", headers={"Host": "vasso.kotobaseed.net"})
    assert r.json()["cancellation_cutoff_hours"] == 168


def test_patch_below_48_rejected(client, active_tutor, teacher_user):
    r = client.patch(
        "/tutor/me",
        json={"cancellation_cutoff_hours": 24},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 422  # Pydantic validation, ge=48


def test_patch_above_floor_accepted(client, active_tutor, teacher_user):
    r = client.patch(
        "/tutor/me",
        json={"cancellation_cutoff_hours": 168},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["cancellation_cutoff_hours"] == 168


# --- Cancel: within / outside cutoff ----------------------------------


def test_cancel_blocked_within_default_48h(
    client, active_tutor, student_user, db_session, monkeypatch
):
    """A confirmed lesson 24h away can't be cancelled even though it's in
    the future — within the 48h platform floor."""
    import backend.routers.users as users_module

    monkeypatch.setattr(users_module, "stripe", type("S", (), {"Refund": type("R", (), {"create": staticmethod(lambda **_: None)})})())
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(hours=24),
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/cancel",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 403
    assert "48" in r.json()["detail"]


def test_cancel_allowed_outside_cutoff(
    client, active_tutor, student_user, db_session, monkeypatch
):
    """72h away — comfortably outside the default 48h window."""
    import backend.routers.users as users_module

    monkeypatch.setattr(users_module, "stripe", type("S", (), {"Refund": type("R", (), {"create": staticmethod(lambda **_: None)})})())
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(hours=72),
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/cancel",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200
    db_session.refresh(booking)
    assert booking.status == BookingStatus.REFUNDED


def test_cancel_respects_tutor_stricter_window(
    client, active_tutor, student_user, db_session, monkeypatch
):
    """Tutor wants a 1-week window; a lesson 4 days out should still be
    blocked even though it's well outside the platform floor."""
    import backend.routers.users as users_module

    monkeypatch.setattr(users_module, "stripe", type("S", (), {"Refund": type("R", (), {"create": staticmethod(lambda **_: None)})})())
    active_tutor.cancellation_cutoff_hours = 168
    db_session.add(active_tutor)
    db_session.commit()
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(hours=96),  # 4 days
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/cancel",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 403
    assert "168" in r.json()["detail"]


def test_pending_payment_cancel_skips_cutoff(
    client, active_tutor, student_user, db_session
):
    """PENDING_PAYMENT bookings bypass the cutoff — no money on the line,
    no reason to penalise a student who closed the Stripe tab."""
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(hours=1),
        status=BookingStatus.PENDING_PAYMENT,
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/cancel",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED


# --- Reschedule -------------------------------------------------------


def test_reschedule_blocked_within_cutoff(
    client, active_tutor, student_user, db_session
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(hours=24),
    )
    new_at = datetime.now(UTC) + timedelta(days=7)
    _seed_window_for(db_session, active_tutor, new_at)
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 403
    assert "48" in r.json()["detail"]


def test_reschedule_blocked_to_slot_within_cutoff(
    client, active_tutor, student_user, db_session
):
    """Existing booking is comfortably outside the cutoff, but the new
    slot is inside it — blocked, otherwise reschedule becomes a backdoor
    out of the no-cancel window."""
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(days=7),
    )
    new_at = datetime.now(UTC) + timedelta(hours=24)
    _seed_window_for(db_session, active_tutor, new_at)
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 400


def test_reschedule_happy_path(
    client, active_tutor, student_user, db_session
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(days=7),
    )
    # Anchor at noon UTC so a 60-minute slot never crosses midnight (which
    # would fall outside the 0..1440 minute-of-day window).
    new_at = (datetime.now(UTC) + timedelta(days=14)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    _seed_window_for(db_session, active_tutor, new_at)
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200, r.text
    db_session.refresh(booking)
    # Compare as naive UTC since sqlite drops tzinfo on read.
    assert booking.scheduled_at.replace(tzinfo=UTC) - new_at < timedelta(seconds=1)
    # Reminder + Daily room reset so the rescheduled lesson gets fresh ones.
    assert booking.reminder_sent_at is None
    assert booking.daily_room_url is None


def test_reschedule_rejects_unavailable_slot(
    client, active_tutor, student_user, db_session
):
    """No availability window for the new weekday → 400."""
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(days=7),
    )
    # Anchor at noon UTC so a 60-minute slot never crosses midnight (which
    # would fall outside the 0..1440 minute-of-day window).
    new_at = (datetime.now(UTC) + timedelta(days=14)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    # NO _seed_window_for — tutor has no availability that day.
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 400
    assert "available" in r.json()["detail"].lower()


def test_reschedule_rejects_double_book(
    client, active_tutor, student_user, db_session
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(days=7),
    )
    # Anchor at noon UTC so a 60-minute slot never crosses midnight (which
    # would fall outside the 0..1440 minute-of-day window).
    new_at = (datetime.now(UTC) + timedelta(days=14)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    _seed_window_for(db_session, active_tutor, new_at)
    # Seed an existing booking at the exact slot we're trying to move into.
    _seed_booking(
        db_session, active_tutor, student_user, pack, new_at,
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 409


def test_reschedule_404_for_other_users_booking(
    client, active_tutor, student_user, teacher_user, db_session
):
    pack = _seed_pack(db_session, active_tutor)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack,
        datetime.now(UTC) + timedelta(days=7),
    )
    # Anchor at noon UTC so a 60-minute slot never crosses midnight (which
    # would fall outside the 0..1440 minute-of-day window).
    new_at = (datetime.now(UTC) + timedelta(days=14)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    _seed_window_for(db_session, active_tutor, new_at)
    # Tutor isn't this booking's student — should 404 (not 403, no leak).
    r = client.post(
        f"/users/me/bookings/{booking.id}/reschedule",
        json={"scheduled_at": new_at.isoformat()},
        headers=auth_headers_for(teacher_user),
    )
    assert r.status_code == 404
