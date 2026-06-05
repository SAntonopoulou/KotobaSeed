"""Booking + reminder email pipeline.

The Resend network call is stubbed at the module boundary so tests run
offline. Verifies that:

- Trial booking fires confirmation emails to student + tutor
- Reminder sweep finds CONFIRMED bookings in the 22–26h window,
  sends, and stamps reminder_sent_at so it doesn't double-fire
- Bookings outside the window or already reminded are skipped
- Cancelled bookings are skipped
- Resend's `send_email` no-op behavior is honored (stub returns False
  with no key set; we still stamp to prevent infinite retries)
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
from backend.services import booking_emails, email as email_service

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


@pytest.fixture
def email_outbox(monkeypatch):
    """Capture sent emails instead of calling Resend."""
    sent: list[dict] = []

    def fake_send(*, to, subject, html, reply_to=None):
        sent.append(
            {"to": to, "subject": subject, "html": html, "reply_to": reply_to}
        )
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send)
    return sent


def _seed_pack(db_session: Session, tutor, *, duration=60, price=2500):
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Single lesson",
        num_lessons=1,
        duration_minutes=duration,
        price_cents=price,
        currency="eur",
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


def _seed_booking(
    db_session: Session,
    tutor,
    student_user,
    pack,
    scheduled_at,
    status=BookingStatus.CONFIRMED,
    reminder_sent_at=None,
):
    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=student_user.id,
        lesson_pack_id=pack.id,
        scheduled_at=scheduled_at,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        status=status,
        reminder_sent_at=reminder_sent_at,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    return booking


# --- Trial confirmation fires two emails -------------------------------


def test_trial_booking_fires_confirmation_emails(
    client, active_tutor, teacher_user, student_user, db_session, email_outbox
):
    # Enable trials + seed an allow_trial window so the booking endpoint
    # accepts the time.
    client.put(
        "/tutor/trial",
        json={"offers_free_trial": True, "free_trial_minutes": 30},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    # Anchor at noon so the trial slot never crosses midnight on hosts
    # where the wall clock is late in the day.
    when = (datetime.now(UTC) + timedelta(days=1)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    db_session.add(
        TutorAvailability(
            tutor_id=active_tutor.id,
            weekday=when.weekday(),
            start_minute=0,
            end_minute=1440,
            allow_trial=True,
        )
    )
    db_session.commit()

    r = client.post(
        "/tutor/trial/book",
        json={"scheduled_at": when.isoformat()},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 201

    # Two emails: student + tutor confirmations.
    assert len(email_outbox) == 2
    recipients = {msg["to"] for msg in email_outbox}
    assert student_user.email in recipients
    assert teacher_user.email in recipients


# --- Reminder sweep ----------------------------------------------------


def test_reminder_sweep_emails_bookings_in_window(
    db_session, active_tutor, student_user, email_outbox
):
    pack = _seed_pack(db_session, active_tutor)
    now = datetime.now(UTC)
    # 24h away — squarely in the 22-26h window.
    target = _seed_booking(db_session, active_tutor, student_user, pack, now + timedelta(hours=24))

    n = booking_emails.sweep_due_reminders(db_session, now=now)
    assert n == 1
    assert len(email_outbox) == 2  # student + tutor reminders

    db_session.refresh(target)
    assert target.reminder_sent_at is not None


def test_reminder_sweep_skips_outside_window(
    db_session, active_tutor, student_user, email_outbox
):
    pack = _seed_pack(db_session, active_tutor)
    now = datetime.now(UTC)
    # 5h away — too soon
    _seed_booking(db_session, active_tutor, student_user, pack, now + timedelta(hours=5))
    # 72h away — too far
    _seed_booking(db_session, active_tutor, student_user, pack, now + timedelta(hours=72))

    assert booking_emails.sweep_due_reminders(db_session, now=now) == 0
    assert email_outbox == []


def test_reminder_sweep_skips_already_reminded(
    db_session, active_tutor, student_user, email_outbox
):
    pack = _seed_pack(db_session, active_tutor)
    now = datetime.now(UTC)
    _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        now + timedelta(hours=24),
        reminder_sent_at=now - timedelta(hours=1),
    )
    assert booking_emails.sweep_due_reminders(db_session, now=now) == 0
    assert email_outbox == []


def test_reminder_sweep_skips_cancelled(
    db_session, active_tutor, student_user, email_outbox
):
    pack = _seed_pack(db_session, active_tutor)
    now = datetime.now(UTC)
    _seed_booking(
        db_session,
        active_tutor,
        student_user,
        pack,
        now + timedelta(hours=24),
        status=BookingStatus.CANCELLED,
    )
    assert booking_emails.sweep_due_reminders(db_session, now=now) == 0
    assert email_outbox == []


def test_reminder_sweep_stamps_even_when_send_fails(
    db_session, active_tutor, student_user, monkeypatch
):
    """If Resend is down, we still stamp the booking so the sweep doesn't
    re-fire every hour for the next day."""

    def failing_send(**kwargs):
        return False  # mirrors the no-key path in services.email

    monkeypatch.setattr(email_service, "send_email", failing_send)

    pack = _seed_pack(db_session, active_tutor)
    now = datetime.now(UTC)
    booking = _seed_booking(
        db_session, active_tutor, student_user, pack, now + timedelta(hours=24)
    )
    n = booking_emails.sweep_due_reminders(db_session, now=now)
    assert n == 1
    db_session.refresh(booking)
    assert booking.reminder_sent_at is not None
