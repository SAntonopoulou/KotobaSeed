"""Classroom (Daily.co) token endpoints — time gating, lazy room creation,
graceful degradation when Daily isn't configured."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from backend.config import settings
from backend.models import Booking, BookingStatus, LessonPack, TutorAccountStatus
from backend.services import daily as daily_module

from .conftest import auth_headers_for


@pytest.fixture(autouse=True)
def daily_configured(monkeypatch):
    """By default, pretend Daily IS configured + stub the HTTP helpers."""
    monkeypatch.setattr(settings, "daily_api_key", "test_key", raising=False)
    rooms_created = []

    def fake_create_room(
        *, name: str, expires_at, enable_chat: bool = True, enable_recording: bool = False
    ):
        # Stubs honor the unconfigured state — production helpers raise
        # `DailyNotConfiguredError` when api_key is unset; we mirror that
        # here so tests can flip api_key=None mid-fixture to exercise the
        # 503 branch.
        if not settings.daily_api_key:
            raise daily_module.DailyNotConfiguredError("Daily.co is not configured.")
        rooms_created.append({"name": name})
        return {"name": name, "url": f"https://kb.daily.co/{name}"}

    def fake_create_meeting_token(*, room_name, user_name, is_owner, expires_at):
        if not settings.daily_api_key:
            raise daily_module.DailyNotConfiguredError("Daily.co is not configured.")
        return f"token-for-{room_name}-{'owner' if is_owner else 'guest'}"

    monkeypatch.setattr(daily_module, "create_room", fake_create_room)
    monkeypatch.setattr(daily_module, "create_meeting_token", fake_create_meeting_token)
    return rooms_created


@pytest.fixture
def active_tutor(db_session: Session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    vasso_tutor.stripe_connect_account_id = "acct_test"
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


@pytest.fixture
def pack(db_session: Session, active_tutor) -> LessonPack:
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


def _make_booking(
    db_session, *, tutor, pack, student_user, scheduled_at, status=BookingStatus.CONFIRMED
) -> Booking:
    b = Booking(
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
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


def test_tutor_token_inside_window_creates_room_once(
    client, active_tutor, pack, teacher_user, student_user, daily_configured, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "tutor"
    assert "token-for-" in body["token"]
    assert body["room_url"].startswith("https://kb.daily.co/")
    assert len(daily_configured) == 1

    # Second call is memoized — no new room.
    r2 = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r2.status_code == 200
    assert len(daily_configured) == 1


def test_tutor_token_too_early_400(
    client, active_tutor, pack, teacher_user, student_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(hours=4),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_tutor_token_after_grace_400(
    client, active_tutor, pack, teacher_user, student_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) - timedelta(hours=5),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_tutor_token_pending_payment_409(
    client, active_tutor, pack, teacher_user, student_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
        status=BookingStatus.PENDING_PAYMENT,
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 409


def test_tutor_token_non_owner_403(
    client, active_tutor, pack, student_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_student_token_inside_window(
    client, active_tutor, pack, student_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/classroom-token",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "student"
    assert "guest" in body["token"]


def test_student_token_wrong_user_404(
    client, active_tutor, pack, student_user, admin_user, db_session
):
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/users/me/bookings/{booking.id}/classroom-token",
        headers=auth_headers_for(admin_user),
    )
    assert r.status_code == 404


def test_503_when_daily_unconfigured(
    monkeypatch, client, active_tutor, pack, teacher_user, student_user, db_session
):
    monkeypatch.setattr(settings, "daily_api_key", None, raising=False)
    booking = _make_booking(
        db_session,
        tutor=active_tutor,
        pack=pack,
        student_user=student_user,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    r = client.post(
        f"/tutor/bookings/{booking.id}/classroom-token",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 503
