"""Tutor onboarding + Connect Express signup flow.

Stripe network calls are stubbed at the module boundary
(`backend.routers.onboarding.create_express_account` etc.) so tests run
offline and deterministically.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from backend.models import Tutor, TutorAccountStatus, User, UserRole
from backend.routers import onboarding as onboarding_module
from backend.routers.pledges import handle_account_updated

from .conftest import auth_headers_for


@pytest.fixture
def stripe_account_state():
    """Mutable state the fake fetch_account returns. Tests tweak this dict
    to simulate Stripe transitioning the account through the onboarding
    capability flags. ``details_submitted`` flips when the tutor finishes
    the Express form; the other two follow as Stripe's checks complete.
    """
    return {
        "details_submitted": False,
        "charges_enabled": False,
        "payouts_enabled": False,
    }


@pytest.fixture(autouse=True)
def stub_stripe(monkeypatch, stripe_account_state):
    """Replace Stripe SDK calls with deterministic stubs."""
    counter = {"n": 0}

    def fake_create_account(*, email: str, country: str | None = None) -> str:
        counter["n"] += 1
        return f"acct_test_{counter['n']:04d}"

    def fake_create_link(*, account_id: str, locale: str | None = None) -> str:
        return f"https://connect.stripe.com/express/{account_id}/onboarding"

    def fake_fetch_account(*, account_id: str) -> dict:
        return {
            "id": account_id,
            "details_submitted": stripe_account_state["details_submitted"],
            "charges_enabled": stripe_account_state["charges_enabled"],
            "payouts_enabled": stripe_account_state["payouts_enabled"],
        }

    monkeypatch.setattr(onboarding_module, "create_express_account", fake_create_account)
    monkeypatch.setattr(onboarding_module, "create_onboarding_link", fake_create_link)
    monkeypatch.setattr(onboarding_module, "fetch_account", fake_fetch_account)


# --- Slug validation -------------------------------------------------------


@pytest.mark.parametrize(
    "bad_slug",
    ["-leading", "trailing-", "with space", "with_underscore", "with.dot"],
)
def test_signup_rejects_invalid_slug(client, bad_slug):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "t@example.com",
            "password": "verysecret",
            "full_name": "T",
            "tutor_slug": bad_slug,
            "display_name": "T",
            "gdpr_consent": True,
        },
    )
    assert r.status_code in (400, 422), r.text


def test_signup_too_short_slug_rejected_by_pydantic(client):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "t@example.com",
            "password": "verysecret",
            "full_name": "T",
            "tutor_slug": "ab",
            "display_name": "T",
            "gdpr_consent": True,
        },
    )
    assert r.status_code == 422


def test_signup_lowercases_mixed_case_slug(client, db_session: Session):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "case@example.com",
            "password": "verysecret",
            "full_name": "Case",
            "tutor_slug": "MixedCase",
            "display_name": "Case",
            "gdpr_consent": True,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["tutor_slug"] == "mixedcase"


@pytest.mark.parametrize("reserved", ["www", "api", "admin"])
def test_signup_rejects_reserved_slug(client, reserved):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "t@example.com",
            "password": "verysecret",
            "full_name": "T",
            "tutor_slug": reserved,
            "display_name": "T",
            "gdpr_consent": True,
        },
    )
    assert r.status_code == 400
    assert "reserved" in r.json()["detail"].lower()


def test_signup_requires_gdpr_consent(client):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "t@example.com",
            "password": "verysecret",
            "full_name": "T",
            "tutor_slug": "vasso",
            "display_name": "Vasso",
            "gdpr_consent": False,
        },
    )
    assert r.status_code == 400


# --- Happy path ------------------------------------------------------------


def test_signup_creates_user_tutor_and_connect_account(client, db_session: Session):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "Vasso@Example.com",
            "password": "verysecret",
            "full_name": "Vasso Test",
            "tutor_slug": "vasso",
            "display_name": "Vasso",
            "languages_taught": "el",
            "timezone": "Europe/Athens",
            "gdpr_consent": True,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tutor_slug"] == "vasso"
    assert body["onboarding_url"].startswith("https://connect.stripe.com/")
    assert "access_token" in body

    user = db_session.exec(select(User).where(User.email == "vasso@example.com")).first()
    assert user is not None
    assert user.role == UserRole.TUTOR
    assert user.gdpr_consent_at is not None

    tutor = db_session.exec(select(Tutor).where(Tutor.tutor_slug == "vasso")).first()
    assert tutor is not None
    assert tutor.user_id == user.id
    assert tutor.account_status == TutorAccountStatus.PAUSED_KYC
    assert tutor.stripe_connect_account_id.startswith("acct_test_")
    assert tutor.classroom_minutes_quota == 300


def test_signup_duplicate_email_409(client):
    payload = {
        "email": "dupe@example.com",
        "password": "verysecret",
        "full_name": "First",
        "tutor_slug": "first",
        "display_name": "First",
        "gdpr_consent": True,
    }
    r1 = client.post("/onboarding/tutor", json=payload)
    assert r1.status_code == 201
    payload["tutor_slug"] = "second"
    r2 = client.post("/onboarding/tutor", json=payload)
    assert r2.status_code == 409


def test_signup_duplicate_slug_409(client):
    payload = {
        "email": "a@example.com",
        "password": "verysecret",
        "full_name": "A",
        "tutor_slug": "duped",
        "display_name": "A",
        "gdpr_consent": True,
    }
    r1 = client.post("/onboarding/tutor", json=payload)
    assert r1.status_code == 201

    payload["email"] = "b@example.com"
    r2 = client.post("/onboarding/tutor", json=payload)
    assert r2.status_code == 409


# --- refresh-link + status -------------------------------------------------


def test_refresh_link_requires_auth(client):
    r = client.post("/onboarding/tutor/refresh-link")
    assert r.status_code in (401, 403)


def test_refresh_link_returns_new_url(client, db_session: Session):
    # Sign up to get a tutor + token.
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "ref@example.com",
            "password": "verysecret",
            "full_name": "Ref",
            "tutor_slug": "refresher",
            "display_name": "Ref",
            "gdpr_consent": True,
        },
    )
    token = r.json()["access_token"]
    r2 = client.post(
        "/onboarding/tutor/refresh-link",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["onboarding_url"].startswith("https://connect.stripe.com/")


def test_status_returns_paused_kyc_before_webhook(client):
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "stat@example.com",
            "password": "verysecret",
            "full_name": "Stat",
            "tutor_slug": "stat",
            "display_name": "Stat",
            "gdpr_consent": True,
        },
    )
    token = r.json()["access_token"]
    r2 = client.get(
        "/onboarding/tutor/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["account_status"] == "paused_kyc"
    assert body["onboarding_complete"] is False


def test_status_404_when_not_a_tutor(client, student_user):
    r = client.get(
        "/onboarding/tutor/status",
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 404


def test_status_self_heals_from_stripe(client, db_session: Session, stripe_account_state):
    """If Stripe says charges+payouts are live, /status flips DB to ACTIVE.
    Self-heals without needing the account.updated webhook.
    """
    r = client.post(
        "/onboarding/tutor",
        json={
            "email": "heal@example.com",
            "password": "verysecret",
            "full_name": "Heal",
            "tutor_slug": "heal",
            "display_name": "Heal",
            "gdpr_consent": True,
        },
    )
    token = r.json()["access_token"]

    tutor = db_session.exec(select(Tutor).where(Tutor.tutor_slug == "heal")).first()
    assert tutor.account_status == TutorAccountStatus.PAUSED_KYC

    # Simulate Stripe finishing onboarding without firing the webhook.
    stripe_account_state["details_submitted"] = True
    stripe_account_state["charges_enabled"] = True
    stripe_account_state["payouts_enabled"] = True

    r2 = client.get(
        "/onboarding/tutor/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["account_status"] == "active"
    assert body["onboarding_complete"] is True

    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.ACTIVE


# --- Webhook account.updated → Tutor.account_status flip --------------------


def test_account_updated_webhook_flips_tutor_to_active(client, db_session: Session):
    """When charges_enabled + payouts_enabled go true, KYC-pending → active."""
    client.post(
        "/onboarding/tutor",
        json={
            "email": "hook@example.com",
            "password": "verysecret",
            "full_name": "Hook",
            "tutor_slug": "hook",
            "display_name": "Hook",
            "gdpr_consent": True,
        },
    )
    tutor = db_session.exec(select(Tutor).where(Tutor.tutor_slug == "hook")).first()
    assert tutor.account_status == TutorAccountStatus.PAUSED_KYC
    acct_id = tutor.stripe_connect_account_id

    handle_account_updated(
        db_session,
        {
            "id": acct_id,
            "details_submitted": True,
            "charges_enabled": True,
            "payouts_enabled": True,
        },
    )
    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.ACTIVE


def test_account_updated_activates_when_payouts_still_pending(
    client, db_session: Session
):
    """Production-realistic case: Stripe approves identity + charges
    immediately, holds payouts pending a side review. The tutor should be
    treated as onboarded — they can take bookings, money sits in their
    Stripe balance until payouts release. Gating ACTIVE on payouts_enabled
    leaves verified tutors permanently stuck on the "finish setup" screen.
    """
    client.post(
        "/onboarding/tutor",
        json={
            "email": "pending@example.com",
            "password": "verysecret",
            "full_name": "P",
            "tutor_slug": "pending",
            "display_name": "P",
            "gdpr_consent": True,
        },
    )
    tutor = db_session.exec(
        select(Tutor).where(Tutor.tutor_slug == "pending")
    ).first()
    acct_id = tutor.stripe_connect_account_id

    handle_account_updated(
        db_session,
        {
            "id": acct_id,
            "details_submitted": True,
            "charges_enabled": True,
            "payouts_enabled": False,  # ← Stripe still reviewing payouts
        },
    )
    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.ACTIVE


def test_account_updated_revocation_reverts_to_kyc(client, db_session: Session):
    client.post(
        "/onboarding/tutor",
        json={
            "email": "revoke@example.com",
            "password": "verysecret",
            "full_name": "R",
            "tutor_slug": "revoke",
            "display_name": "R",
            "gdpr_consent": True,
        },
    )
    tutor = db_session.exec(select(Tutor).where(Tutor.tutor_slug == "revoke")).first()
    acct_id = tutor.stripe_connect_account_id

    # First: activate.
    handle_account_updated(
        db_session,
        {
            "id": acct_id,
            "details_submitted": True,
            "charges_enabled": True,
            "payouts_enabled": True,
        },
    )
    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.ACTIVE

    # Then: Stripe revokes charges.
    handle_account_updated(
        db_session,
        {
            "id": acct_id,
            "details_submitted": True,
            "charges_enabled": False,
            "payouts_enabled": True,
        },
    )
    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.PAUSED_KYC
