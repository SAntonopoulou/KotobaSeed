"""Tutor availability CRUD + slot computation."""

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
    teacher_user.timezone = "UTC"  # keep things simple in tests
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    db_session.refresh(teacher_user)
    return vasso_tutor


@pytest.fixture
def pack60(db_session: Session, active_tutor) -> LessonPack:
    p = LessonPack(
        tutor_id=active_tutor.id,
        name="One lesson",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


# --- CRUD ----------------------------------------------------------------


def test_replace_availability_requires_owner(client, active_tutor, student_user):
    r = client.put(
        "/tutor/availability",
        json={"windows": [{"weekday": 0, "start_minute": 540, "end_minute": 1020}]},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_replace_availability_validates_window_length(client, active_tutor, teacher_user):
    r = client.put(
        "/tutor/availability",
        json={"windows": [{"weekday": 0, "start_minute": 540, "end_minute": 540}]},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_replace_then_list_round_trips(client, active_tutor, teacher_user):
    r = client.put(
        "/tutor/availability",
        json={
            "windows": [
                {"weekday": 0, "start_minute": 540, "end_minute": 720},
                {"weekday": 0, "start_minute": 840, "end_minute": 1020},
                {"weekday": 3, "start_minute": 600, "end_minute": 960},
            ]
        },
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert len(r.json()) == 3
    r2 = client.get("/tutor/availability", headers={"Host": "vasso.kotobaseed.net"})
    assert [w["weekday"] for w in r2.json()] == [0, 0, 3]


def test_replace_is_idempotent_replace_not_merge(client, active_tutor, teacher_user):
    client.put(
        "/tutor/availability",
        json={"windows": [{"weekday": 0, "start_minute": 540, "end_minute": 720}]},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    client.put(
        "/tutor/availability",
        json={"windows": [{"weekday": 4, "start_minute": 780, "end_minute": 900}]},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    r = client.get("/tutor/availability", headers={"Host": "vasso.kotobaseed.net"})
    body = r.json()
    assert len(body) == 1
    assert body[0]["weekday"] == 4


# --- Slot computation ----------------------------------------------------


def _seed_window(db_session, tutor, weekday, start_min, end_min):
    db_session.add(
        TutorAvailability(
            tutor_id=tutor.id,
            weekday=weekday,
            start_minute=start_min,
            end_minute=end_min,
        )
    )
    db_session.commit()


def test_no_windows_means_no_slots(client, active_tutor, pack60):
    r = client.get(
        f"/tutor/availability/slots?pack_id={pack60.id}",
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_slot_walk_produces_expected_count(client, active_tutor, pack60, db_session: Session):
    """9:00-13:00 (240 min) with 60-min lessons in 30-min steps → 7 slots/day."""
    today_weekday = datetime.now(UTC).weekday()
    target_weekday = (today_weekday + 3) % 7
    _seed_window(db_session, active_tutor, target_weekday, 540, 780)

    r = client.get(
        f"/tutor/availability/slots?pack_id={pack60.id}&days=14",
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code == 200
    slots = r.json()
    assert len(slots) >= 2 * 7
    assert all(s["duration_minutes"] == 60 for s in slots)


def test_existing_booking_blocks_overlapping_slots(client, active_tutor, pack60, db_session: Session):
    today_weekday = datetime.now(UTC).weekday()
    target_weekday = (today_weekday + 3) % 7
    _seed_window(db_session, active_tutor, target_weekday, 540, 780)

    days_ahead = ((target_weekday - today_weekday) % 7) or 7
    block_day = (datetime.now(UTC) + timedelta(days=days_ahead)).date()
    db_session.add(
        Booking(
            tutor_id=active_tutor.id,
            student_user_id=1,
            lesson_pack_id=pack60.id,
            scheduled_at=datetime(block_day.year, block_day.month, block_day.day, 10, 0, tzinfo=UTC),
            duration_minutes=60,
            price_cents=2500,
            currency="eur",
            status=BookingStatus.CONFIRMED,
        )
    )
    db_session.commit()

    r = client.get(
        f"/tutor/availability/slots?pack_id={pack60.id}&days=14",
        headers={"Host": "vasso.kotobaseed.net"},
    )
    slots = r.json()
    block_slots = [s for s in slots if s["scheduled_at"].startswith(block_day.isoformat())]
    assert len(block_slots) == 4  # 9:00, 11:00, 11:30, 12:00


def test_cancelled_booking_does_not_block_slots(client, active_tutor, pack60, db_session: Session):
    today_weekday = datetime.now(UTC).weekday()
    target_weekday = (today_weekday + 3) % 7
    _seed_window(db_session, active_tutor, target_weekday, 540, 780)
    days_ahead = ((target_weekday - today_weekday) % 7) or 7
    block_day = (datetime.now(UTC) + timedelta(days=days_ahead)).date()
    db_session.add(
        Booking(
            tutor_id=active_tutor.id,
            student_user_id=1,
            lesson_pack_id=pack60.id,
            scheduled_at=datetime(block_day.year, block_day.month, block_day.day, 10, 0, tzinfo=UTC),
            duration_minutes=60,
            price_cents=2500,
            currency="eur",
            status=BookingStatus.CANCELLED,
        )
    )
    db_session.commit()

    r = client.get(
        f"/tutor/availability/slots?pack_id={pack60.id}&days=14",
        headers={"Host": "vasso.kotobaseed.net"},
    )
    slots = r.json()
    block_slots = [s for s in slots if s["scheduled_at"].startswith(block_day.isoformat())]
    assert len(block_slots) == 7


def test_invalid_days_rejected(client, active_tutor, pack60):
    r = client.get(
        f"/tutor/availability/slots?pack_id={pack60.id}&days=999",
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code == 400
