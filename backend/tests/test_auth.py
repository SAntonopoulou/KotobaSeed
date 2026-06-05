"""Auth + email verification flow tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from backend.models import User

from .conftest import auth_headers_for


def test_register_requires_gdpr_consent(client):
    r = client.post(
        "/auth/register",
        json={
            "email": "nogdpr@example.com",
            "password": "verysecret",
            "full_name": "No Consent",
            "gdpr_consent": False,
        },
    )
    assert r.status_code == 400
    assert "gdpr" in r.json()["detail"].lower()


def test_register_creates_user_with_pending_verification(client, db_session: Session):
    r = client.post(
        "/auth/register",
        json={
            "email": "Casey@Example.com",  # mixed case → should be lowercased
            "password": "verysecret",
            "full_name": "Casey Test",
            "gdpr_consent": True,
            "newsletter_opt_in": True,
            "timezone": "Europe/Athens",
        },
    )
    assert r.status_code == 201, r.text
    user = db_session.exec(select(User).where(User.email == "casey@example.com")).first()
    assert user is not None
    assert user.email == "casey@example.com"
    assert user.newsletter_opt_in is True
    assert user.timezone == "Europe/Athens"
    assert user.is_active is True
    assert user.gdpr_consent_at is not None
    # Code was issued
    assert user.email_verification_code_hash is not None
    assert user.email_verification_expires_at is not None
    assert user.email_verified_at is None


def test_duplicate_email_registration_409(client):
    payload = {
        "email": "dupe@example.com",
        "password": "verysecret",
        "full_name": "First",
        "gdpr_consent": True,
    }
    r1 = client.post("/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/auth/register", json=payload)
    assert r2.status_code == 409


def test_login_rejects_wrong_password(client):
    client.post(
        "/auth/register",
        json={
            "email": "loginer@example.com",
            "password": "rightpass1",
            "full_name": "Login Tester",
            "gdpr_consent": True,
        },
    )
    r = client.post(
        "/auth/login",
        json={"email": "loginer@example.com", "password": "wrongpass"},
    )
    assert r.status_code == 401


def test_login_rejects_disabled_account(client, db_session: Session, student_user):
    student_user.is_active = False
    db_session.add(student_user)
    db_session.commit()
    r = client.post(
        "/auth/login",
        json={"email": "student@example.com", "password": "password123"},
    )
    assert r.status_code == 403


def test_verify_email_happy_path(client, db_session: Session, student_user):
    # Manually issue a known code via the security helper.
    from backend.security import hash_password

    plaintext_code = "123456"
    student_user.email_verification_code_hash = hash_password(plaintext_code)
    student_user.email_verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    db_session.add(student_user)
    db_session.commit()

    r = client.post(
        "/auth/verify-email",
        json={"code": plaintext_code},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"verified": True}

    db_session.refresh(student_user)
    assert student_user.email_verified_at is not None
    assert student_user.email_verification_code_hash is None


def test_verify_email_rejects_wrong_code(client, db_session: Session, student_user):
    from backend.security import hash_password

    student_user.email_verification_code_hash = hash_password("111111")
    student_user.email_verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    db_session.add(student_user)
    db_session.commit()

    r = client.post(
        "/auth/verify-email",
        json={"code": "999999"},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 400


def test_verify_email_rejects_expired_code(client, db_session: Session, student_user):
    from backend.security import hash_password

    student_user.email_verification_code_hash = hash_password("424242")
    student_user.email_verification_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.add(student_user)
    db_session.commit()

    r = client.post(
        "/auth/verify-email",
        json={"code": "424242"},
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 400
    assert "expired" in r.json()["detail"].lower()


def test_resend_verification_rotates_code(client, db_session: Session, student_user):
    from backend.security import hash_password

    old_hash = hash_password("000000")
    student_user.email_verification_code_hash = old_hash
    student_user.email_verification_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    db_session.add(student_user)
    db_session.commit()

    r = client.post(
        "/auth/resend-verification",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 200
    assert r.json() == {"verified": False}

    db_session.refresh(student_user)
    assert student_user.email_verification_code_hash is not None
    assert student_user.email_verification_code_hash != old_hash


def test_me_returns_current_user(client, student_user):
    r = client.get("/auth/me", headers=auth_headers_for(student_user))
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "student@example.com"
    assert body["role"] == "student"
    assert body["is_active"] is True
    assert body["email_verified_at"] is None
