"""Booking flow tests — checkout, validation, and webhook confirmation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    SubscriptionTier,
    TutorAccountStatus,
)
from backend.routers import tutor_site as tutor_site_module

from .conftest import auth_headers_for


@pytest.fixture(autouse=True)
def stub_stripe_checkout(monkeypatch):
    """Replace stripe.checkout.Session.create with a deterministic stub.

    The stub captures the kwargs each test received so we can assert on them
    (e.g. application_fee_amount = 0 for Pro tutors).
    """
    calls = []

    def fake_create(**kwargs):
        calls.append(kwargs)
        return {
            "id": f"cs_test_{len(calls):04d}",
            "url": f"https://checkout.stripe.com/c/pay/cs_test_{len(calls):04d}",
        }

    monkeypatch.setattr(tutor_site_module.stripe.checkout.Session, "create", fake_create)
    return calls


@pytest.fixture
def active_tutor(db_session: Session, vasso_tutor, teacher_user):
    """Move vasso_tutor to ACTIVE with a Stripe Connect account on file so it
    can accept bookings."""
    from backend.models import TutorAvailability

    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    vasso_tutor.stripe_connect_account_id = "acct_test_vasso"
    db_session.add(vasso_tutor)
    # Open availability all week so the paid-booking slot validator
    # (which now mirrors trial validation — book_trial pattern) can
    # find a matching window for the default `now + 2 days` slot.
    for weekday in range(7):
        db_session.add(
            TutorAvailability(
                tutor_id=vasso_tutor.id,
                weekday=weekday,
                start_minute=0,
                end_minute=1440,
                allow_trial=True,
            )
        )
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


@pytest.fixture
def free_tier_user_owning_tutor(db_session: Session, active_tutor, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.FREE
    db_session.add(teacher_user)
    db_session.commit()
    return teacher_user


@pytest.fixture
def pro_tier_user_owning_tutor(db_session: Session, active_tutor, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    return teacher_user


@pytest.fixture
def pack(db_session: Session, active_tutor) -> LessonPack:
    p = LessonPack(
        tutor_id=active_tutor.id,
        name="One lesson",
        description="60 min",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _book(client, pack_id, headers, when=None, host="vasso.kotobaseed.net"):
    when = when or (datetime.now(UTC) + timedelta(days=2))
    return client.post(
        f"/tutor/lesson-packs/{pack_id}/book",
        json={"scheduled_at": when.isoformat()},
        headers={"Host": host, **headers},
    )


def test_booking_requires_auth(client, active_tutor, pack):
    r = client.post(
        f"/tutor/lesson-packs/{pack.id}/book",
        json={"scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code in (401, 403)


def test_tutor_cant_book_own_pack(client, active_tutor, pack, teacher_user):
    r = _book(client, pack.id, auth_headers_for(teacher_user))
    assert r.status_code == 400


def test_inactive_pack_404s(client, active_tutor, pack, student_user, db_session: Session):
    pack.is_active = False
    db_session.add(pack)
    db_session.commit()
    r = _book(client, pack.id, auth_headers_for(student_user))
    assert r.status_code == 404


def test_paused_tutor_cant_take_bookings(client, active_tutor, pack, student_user, db_session: Session):
    active_tutor.account_status = TutorAccountStatus.PAUSED_DORMANT
    db_session.add(active_tutor)
    db_session.commit()
    r = _book(client, pack.id, auth_headers_for(student_user))
    assert r.status_code == 409


def test_past_datetime_rejected(client, active_tutor, pack, student_user):
    r = _book(client, pack.id, auth_headers_for(student_user), when=datetime.now(UTC) - timedelta(hours=1))
    assert r.status_code == 400


def test_happy_path_free_tutor_uses_5pct_fee(
    client, free_tier_user_owning_tutor, pack, student_user, stub_stripe_checkout, db_session
):
    r = _book(client, pack.id, auth_headers_for(student_user))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["checkout_url"].startswith("https://checkout.stripe.com/")
    booking_id = body["booking_id"]

    booking = db_session.get(Booking, booking_id)
    assert booking is not None
    assert booking.status == BookingStatus.PENDING_PAYMENT
    assert booking.platform_fee_cents == round(2500 * 0.05)  # 5% of €25 = €1.25
    assert booking.stripe_checkout_session_id == "cs_test_0001"

    # The Stripe call sent the right Application Fee + transfer destination
    call = stub_stripe_checkout[-1]
    assert call["payment_intent_data"]["application_fee_amount"] == 125
    assert call["payment_intent_data"]["transfer_data"]["destination"] == "acct_test_vasso"


def test_pro_tutor_uses_zero_fee(
    client, pro_tier_user_owning_tutor, pack, student_user, stub_stripe_checkout, db_session
):
    r = _book(client, pack.id, auth_headers_for(student_user))
    assert r.status_code == 201
    booking = db_session.get(Booking, r.json()["booking_id"])
    assert booking.platform_fee_cents == 0
    call = stub_stripe_checkout[-1]
    assert call["payment_intent_data"]["application_fee_amount"] == 0


def test_webhook_confirms_pending_booking(
    client, free_tier_user_owning_tutor, pack, student_user, stub_stripe_checkout, db_session
):
    r = _book(client, pack.id, auth_headers_for(student_user))
    booking_id = r.json()["booking_id"]
    session_id = "cs_test_0001"

    # Simulate Stripe webhook calling the handler directly
    from backend.routers.pledges import handle_checkout_session_completed

    handle_checkout_session_completed(
        db_session,
        {
            "id": session_id,
            "payment_intent": "pi_test_abc",
            "metadata": {"type": "booking", "booking_id": str(booking_id), "tutor_slug": "vasso"},
        },
    )

    booking = db_session.get(Booking, booking_id)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED
    assert booking.paid_at is not None
    assert booking.stripe_payment_intent_id == "pi_test_abc"


def test_webhook_duplicate_for_same_booking_is_noop(
    client, free_tier_user_owning_tutor, pack, student_user, stub_stripe_checkout, db_session
):
    """A re-fired Stripe event for an already-confirmed Booking shouldn't crash
    or rewrite state."""
    r = _book(client, pack.id, auth_headers_for(student_user))
    booking_id = r.json()["booking_id"]

    from backend.routers.pledges import handle_checkout_session_completed

    payload = {
        "id": "cs_test_0001",
        "payment_intent": "pi_test_abc",
        "metadata": {"type": "booking", "booking_id": str(booking_id), "tutor_slug": "vasso"},
    }
    handle_checkout_session_completed(db_session, payload)
    handle_checkout_session_completed(db_session, payload)  # second time

    booking = db_session.get(Booking, booking_id)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED  # still confirmed, no error
