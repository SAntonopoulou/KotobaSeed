"""Newsletter compose, audience, broadcast, and unsubscribe."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    Newsletter,
    NewsletterUnsubscribe,
    TutorAccountStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash
from backend.services import email as email_service, newsletters as svc

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _headers(user):
    return {"Host": HOST, **auth_headers_for(user)}


def _make_student(db_session, email: str, verified: bool = True, active: bool = True) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=email.split("@")[0].title(),
        role=UserRole.STUDENT,
        is_active=active,
        email_verified_at=datetime.now(UTC) if verified else None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_pack(db_session, tutor):
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Single",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


def _booking(db_session, tutor, student, pack, status):
    b = Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=datetime.now(UTC),
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        status=status,
    )
    db_session.add(b)
    db_session.commit()
    return b


@pytest.fixture
def active_tutor(db_session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


@pytest.fixture
def email_outbox(monkeypatch):
    """Capture sent emails so tests don't try real Resend calls."""
    sent: list[dict] = []

    def fake_send(*, to, subject, html, reply_to=None):
        sent.append({"to": to, "subject": subject, "html": html, "reply_to": reply_to})
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send)
    return sent


# --- Audience ---------------------------------------------------------


def test_audience_includes_confirmed_and_completed(
    active_tutor, db_session
):
    pack = _make_pack(db_session, active_tutor)
    s1 = _make_student(db_session, "s1@example.com")
    s2 = _make_student(db_session, "s2@example.com")
    _booking(db_session, active_tutor, s1, pack, BookingStatus.CONFIRMED)
    _booking(db_session, active_tutor, s2, pack, BookingStatus.COMPLETED)
    users = svc.audience_users(active_tutor, db_session)
    assert {u.email for u in users} == {"s1@example.com", "s2@example.com"}


def test_audience_excludes_cancelled_and_refunded(active_tutor, db_session):
    pack = _make_pack(db_session, active_tutor)
    cancelled = _make_student(db_session, "cancelled@example.com")
    refunded = _make_student(db_session, "refunded@example.com")
    _booking(db_session, active_tutor, cancelled, pack, BookingStatus.CANCELLED)
    _booking(db_session, active_tutor, refunded, pack, BookingStatus.REFUNDED)
    assert svc.audience_users(active_tutor, db_session) == []


def test_audience_excludes_unsubscribed(active_tutor, db_session):
    pack = _make_pack(db_session, active_tutor)
    keep = _make_student(db_session, "keep@example.com")
    drop = _make_student(db_session, "drop@example.com")
    _booking(db_session, active_tutor, keep, pack, BookingStatus.CONFIRMED)
    _booking(db_session, active_tutor, drop, pack, BookingStatus.CONFIRMED)
    db_session.add(NewsletterUnsubscribe(tutor_id=active_tutor.id, student_user_id=drop.id))
    db_session.commit()
    emails = {u.email for u in svc.audience_users(active_tutor, db_session)}
    assert emails == {"keep@example.com"}


def test_audience_excludes_inactive_and_unverified_users(active_tutor, db_session):
    pack = _make_pack(db_session, active_tutor)
    inactive = _make_student(db_session, "inactive@example.com", active=False)
    unverified = _make_student(db_session, "unverified@example.com", verified=False)
    fine = _make_student(db_session, "fine@example.com")
    for s in (inactive, unverified, fine):
        _booking(db_session, active_tutor, s, pack, BookingStatus.CONFIRMED)
    emails = {u.email for u in svc.audience_users(active_tutor, db_session)}
    assert emails == {"fine@example.com"}


def test_audience_dedupes_students_with_multiple_bookings(active_tutor, db_session):
    pack = _make_pack(db_session, active_tutor)
    student = _make_student(db_session, "loyal@example.com")
    for _ in range(3):
        _booking(db_session, active_tutor, student, pack, BookingStatus.COMPLETED)
    assert svc.audience_count(active_tutor, db_session) == 1


# --- Unsubscribe tokens ---------------------------------------------


def test_unsubscribe_token_roundtrips():
    token = svc.make_unsubscribe_token(42, 17)
    parsed = svc.verify_unsubscribe_token(token)
    assert parsed == (42, 17)


def test_unsubscribe_token_rejects_tamper():
    token = svc.make_unsubscribe_token(42, 17)
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert svc.verify_unsubscribe_token(tampered) is None


def test_unsubscribe_token_rejects_garbage():
    assert svc.verify_unsubscribe_token("nope") is None
    assert svc.verify_unsubscribe_token("a.b.c.d") is None


# --- HTTP: drafts ----------------------------------------------------


def test_list_requires_owner(client, active_tutor, student_user):
    r = client.get("/tutor/newsletters", headers=_headers(student_user))
    assert r.status_code == 403


def test_create_draft(client, active_tutor, teacher_user):
    r = client.post(
        "/tutor/newsletters",
        json={"subject": "Hello students!", "body_markdown": "**Welcome.**"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 201
    assert r.json()["status"] == "draft"
    assert r.json()["subject"] == "Hello students!"


def test_audience_count_endpoint(client, active_tutor, teacher_user, db_session):
    pack = _make_pack(db_session, active_tutor)
    for i in range(3):
        s = _make_student(db_session, f"s{i}@example.com")
        _booking(db_session, active_tutor, s, pack, BookingStatus.CONFIRMED)
    r = client.get(
        "/tutor/newsletters/audience-count", headers=_headers(teacher_user)
    )
    assert r.status_code == 200
    assert r.json()["count"] == 3


def test_patch_draft_updates_fields(client, active_tutor, teacher_user):
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Original", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    r = client.patch(
        f"/tutor/newsletters/{nid}",
        json={"subject": "Updated", "body_markdown": "Body"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["subject"] == "Updated"


def test_delete_draft(client, active_tutor, teacher_user, db_session):
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Goodbye", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    r = client.delete(f"/tutor/newsletters/{nid}", headers=_headers(teacher_user))
    assert r.status_code == 204
    assert db_session.get(Newsletter, nid) is None


# --- HTTP: send + immutability of sent rows -------------------------


def test_send_test_does_not_change_status(
    client, active_tutor, teacher_user, email_outbox
):
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Test me", "body_markdown": "Hi"},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    r = client.post(
        f"/tutor/newsletters/{nid}/test",
        json={"recipient_email": "me@example.com"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    assert r.json()["last_test_sent_at"] is not None
    assert len(email_outbox) == 1
    assert email_outbox[0]["to"] == "me@example.com"
    assert email_outbox[0]["subject"].startswith("[Test] ")


def test_broadcast_sends_to_audience_and_marks_sent(
    client, active_tutor, teacher_user, db_session, email_outbox
):
    pack = _make_pack(db_session, active_tutor)
    s1 = _make_student(db_session, "a@example.com")
    s2 = _make_student(db_session, "b@example.com")
    _booking(db_session, active_tutor, s1, pack, BookingStatus.CONFIRMED)
    _booking(db_session, active_tutor, s2, pack, BookingStatus.COMPLETED)
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Broadcast", "body_markdown": "Hello all"},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    r = client.post(
        f"/tutor/newsletters/{nid}/send", headers=_headers(teacher_user)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "sent"
    assert body["sent_at"] is not None
    assert body["recipient_count"] == 2
    assert len(email_outbox) == 2
    # Each recipient's email body includes an unsubscribe link.
    for msg in email_outbox:
        assert "/newsletters/unsubscribe?token=" in msg["html"]


def test_sent_newsletter_cannot_be_edited(
    client, active_tutor, teacher_user, db_session, email_outbox
):
    pack = _make_pack(db_session, active_tutor)
    s = _make_student(db_session, "x@example.com")
    _booking(db_session, active_tutor, s, pack, BookingStatus.CONFIRMED)
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Once", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    client.post(f"/tutor/newsletters/{nid}/send", headers=_headers(teacher_user))
    r = client.patch(
        f"/tutor/newsletters/{nid}",
        json={"subject": "Twice"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 409


def test_sent_newsletter_cannot_be_resent(
    client, active_tutor, teacher_user, db_session, email_outbox
):
    pack = _make_pack(db_session, active_tutor)
    s = _make_student(db_session, "x@example.com")
    _booking(db_session, active_tutor, s, pack, BookingStatus.CONFIRMED)
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Once only", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    client.post(f"/tutor/newsletters/{nid}/send", headers=_headers(teacher_user))
    r = client.post(
        f"/tutor/newsletters/{nid}/send", headers=_headers(teacher_user)
    )
    assert r.status_code == 409


# --- Unsubscribe public endpoint -----------------------------------


def test_unsubscribe_endpoint_records_row(
    client, active_tutor, db_session
):
    student = _make_student(db_session, "leaving@example.com")
    token = svc.make_unsubscribe_token(active_tutor.id, student.id)
    r = client.get(f"/newsletters/unsubscribe?token={token}")
    assert r.status_code == 200
    assert svc.already_unsubscribed(active_tutor.id, student.id, db_session)


def test_unsubscribe_endpoint_idempotent(
    client, active_tutor, db_session
):
    student = _make_student(db_session, "double@example.com")
    token = svc.make_unsubscribe_token(active_tutor.id, student.id)
    client.get(f"/newsletters/unsubscribe?token={token}")
    r = client.get(f"/newsletters/unsubscribe?token={token}")
    assert r.status_code == 200


def test_unsubscribe_endpoint_400_for_bad_token(client):
    r = client.get("/newsletters/unsubscribe?token=junk")
    assert r.status_code == 400


def test_broadcast_skips_unsubscribed(
    client, active_tutor, teacher_user, db_session, email_outbox
):
    pack = _make_pack(db_session, active_tutor)
    keep = _make_student(db_session, "keep@example.com")
    drop = _make_student(db_session, "drop@example.com")
    for s in (keep, drop):
        _booking(db_session, active_tutor, s, pack, BookingStatus.CONFIRMED)
    db_session.add(NewsletterUnsubscribe(tutor_id=active_tutor.id, student_user_id=drop.id))
    db_session.commit()
    created = client.post(
        "/tutor/newsletters",
        json={"subject": "Filtered", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    nid = created.json()["id"]
    r = client.post(f"/tutor/newsletters/{nid}/send", headers=_headers(teacher_user))
    assert r.json()["recipient_count"] == 1
    assert {m["to"] for m in email_outbox} == {"keep@example.com"}
