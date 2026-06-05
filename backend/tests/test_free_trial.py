"""Free-trial flow: settings, auto-managed pack, student-side booking."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session, select

from backend.models import Booking, BookingStatus, LessonPack, TutorAccountStatus

from .conftest import auth_headers_for


@pytest.fixture
def active_tutor(db_session: Session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    vasso_tutor.stripe_connect_account_id = "acct_test"
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


def _enable_trial(client, teacher_user, minutes=20):
    """Trial cap is no longer configurable — always 1 per student per tutor."""
    return client.put(
        "/tutor/trial",
        json={"offers_free_trial": True, "free_trial_minutes": minutes},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )


def test_get_trial_default_off(client, active_tutor):
    r = client.get("/tutor/trial", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200
    assert r.json()["offers_free_trial"] is False


def test_enable_creates_managed_trial_pack(client, active_tutor, teacher_user, db_session):
    r = _enable_trial(client, teacher_user, minutes=25)
    assert r.status_code == 200
    body = r.json()
    assert body["offers_free_trial"] is True
    assert body["free_trial_minutes"] == 25

    pack = db_session.exec(
        select(LessonPack).where(LessonPack.tutor_id == active_tutor.id)
    ).first()
    assert pack is not None
    assert pack.is_trial is True
    assert pack.is_active is True
    assert pack.price_cents == 0
    assert pack.duration_minutes == 25


def test_enable_then_disable_deactivates_trial_pack(
    client, active_tutor, teacher_user, db_session
):
    _enable_trial(client, teacher_user)
    r = client.put(
        "/tutor/trial",
        json={"offers_free_trial": False},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    pack = db_session.exec(
        select(LessonPack).where(LessonPack.tutor_id == active_tutor.id)
    ).first()
    assert pack is not None
    assert pack.is_active is False


def test_trial_pack_hidden_from_public_pack_list(
    client, active_tutor, teacher_user
):
    _enable_trial(client, teacher_user)
    r = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200
    assert r.json() == []


def test_book_trial_happy_path(
    client, active_tutor, teacher_user, student_user, db_session
):
    _enable_trial(client, teacher_user)
    when = datetime.now(UTC) + timedelta(days=1)
    r = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": when.isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 201, r.text
    booking_id = r.json()["booking_id"]
    booking = db_session.get(Booking, booking_id)
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED
    assert booking.price_cents == 0
    assert booking.platform_fee_cents == 0
    assert booking.duration_minutes == 20


def test_book_trial_404_when_disabled(client, active_tutor, student_user):
    r = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 404


def test_book_trial_enforces_one_per_student_lifetime(
    client, active_tutor, teacher_user, student_user
):
    """Hard cap of 1 trial per student per tutor — not configurable."""
    _enable_trial(client, teacher_user)
    r1 = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=2)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r2.status_code == 409
    # And a third attempt also blocked — to be very sure the limit is 1, not N.
    r3 = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=3)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r3.status_code == 409


def test_tutor_cant_trial_book_self(client, active_tutor, teacher_user):
    _enable_trial(client, teacher_user)
    r = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_trial_book_past_time_rejected(client, active_tutor, teacher_user, student_user):
    _enable_trial(client, teacher_user)
    r = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 400
