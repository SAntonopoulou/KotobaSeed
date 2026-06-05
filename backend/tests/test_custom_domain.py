"""Custom-domain claim + verification flow.

DNS lookups are monkeypatched at the socket boundary so tests stay offline.
Covers: plan gating, domain validation, conflict on duplicate claim,
verify success + failure, tenancy honours verified domains only.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session

from backend.config import settings
from backend.models import SubscriptionTier, Tutor
from backend.services import custom_domain as custom_domain_service

from .conftest import auth_headers_for


@pytest.fixture(autouse=True)
def clean_vasso_custom_domain(db_session: Session, vasso_tutor):
    """The shared vasso_tutor fixture preseeds `greekwithvasso.com` so the
    multi-tenant resolution tests can exercise it. These tests are about
    the claim flow itself, so we clear it first."""
    vasso_tutor.custom_domain = None
    vasso_tutor.custom_domain_verified_at = None
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


@pytest.fixture
def pro_teacher(db_session: Session, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(teacher_user)
    return teacher_user


@pytest.fixture
def server_ip_set(monkeypatch):
    """Pretend the platform has a configured server IP."""
    monkeypatch.setattr(settings, "kotobaseed_server_ip", "5.75.149.59")
    monkeypatch.setattr(settings, "custom_domain_auto_verify", False)


@pytest.fixture
def dns_resolves_to(monkeypatch):
    """Return a function that stubs socket.gethostbyname to return whatever
    IP the test passes in. Resetting after each test is automatic via
    monkeypatch."""

    def _set(ip: str | None):
        def fake(_host):
            if ip is None:
                raise OSError("nope")
            return ip

        monkeypatch.setattr(custom_domain_service.socket, "gethostbyname", fake)

    return _set


# --- Read ----------------------------------------------------------------


def test_get_returns_not_set_for_new_tutor(client, vasso_tutor, teacher_user):
    r = client.get(
        "/tutor/custom-domain",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "not_set"
    assert body["domain"] is None


def test_get_requires_owner(client, vasso_tutor, student_user):
    r = client.get(
        "/tutor/custom-domain",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


# --- Save (plan gating + validation) -------------------------------------


def test_save_requires_pro_subscription(client, vasso_tutor, teacher_user):
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "mygreeksite.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402
    assert "Pro" in r.json()["detail"]


def test_save_succeeds_for_pro(client, vasso_tutor, pro_teacher):
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "MyGreekSite.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["domain"] == "mygreeksite.com"  # normalized
    assert body["status"] == "pending"
    assert body["verified_at"] is None


def test_save_rejects_kotobaseed_apex(client, vasso_tutor, pro_teacher):
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "kotobaseed.net"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400


def test_save_rejects_invalid_domain(client, vasso_tutor, pro_teacher):
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "not a domain at all"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400


def test_save_strips_protocol_and_path(client, vasso_tutor, pro_teacher):
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "https://my-site.com/extra"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200
    assert r.json()["domain"] == "my-site.com"


def test_save_409_on_conflict(client, vasso_tutor, pro_teacher, db_session):
    other = Tutor(
        user_id=999_999,
        tutor_slug="other",
        display_name="Other tutor",
        custom_domain="taken.com",
    )
    db_session.add(other)
    db_session.commit()
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "taken.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 409


# --- Verify --------------------------------------------------------------


def test_verify_400_without_saved_domain(client, vasso_tutor, pro_teacher):
    r = client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400


def test_verify_success_when_dns_matches(
    client, vasso_tutor, pro_teacher, server_ip_set, dns_resolves_to
):
    client.put(
        "/tutor/custom-domain",
        json={"domain": "my-site.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    dns_resolves_to("5.75.149.59")
    r = client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "verified"
    assert body["verified_at"] is not None


def test_verify_fails_when_dns_mismatches(
    client, vasso_tutor, pro_teacher, server_ip_set, dns_resolves_to
):
    client.put(
        "/tutor/custom-domain",
        json={"domain": "my-site.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    dns_resolves_to("1.2.3.4")  # not us
    r = client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400


def test_verify_fails_when_dns_lookup_errors(
    client, vasso_tutor, pro_teacher, server_ip_set, dns_resolves_to
):
    client.put(
        "/tutor/custom-domain",
        json={"domain": "my-site.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    dns_resolves_to(None)  # raises OSError
    r = client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400


def test_auto_verify_short_circuits_dns(
    client, vasso_tutor, pro_teacher, monkeypatch
):
    monkeypatch.setattr(settings, "custom_domain_auto_verify", True)
    client.put(
        "/tutor/custom-domain",
        json={"domain": "my-site.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    r = client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "verified"


# --- Saving after verify resets state ------------------------------------


def test_save_clears_prior_verification(
    client, vasso_tutor, pro_teacher, monkeypatch
):
    monkeypatch.setattr(settings, "custom_domain_auto_verify", True)
    client.put(
        "/tutor/custom-domain",
        json={"domain": "first.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    # Now change to a new domain — verification should reset.
    r = client.put(
        "/tutor/custom-domain",
        json={"domain": "second.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.json()["status"] == "pending"


# --- Tenancy middleware honours verified domain only ---------------------


def test_tenancy_resolves_verified_custom_domain(
    client, vasso_tutor, pro_teacher, db_session, monkeypatch
):
    monkeypatch.setattr(settings, "custom_domain_auto_verify", True)
    client.put(
        "/tutor/custom-domain",
        json={"domain": "vassoteaches.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    # Now a request with Host=vassoteaches.com should resolve to this tutor.
    r = client.get("/tutor/me", headers={"Host": "vassoteaches.com"})
    assert r.status_code == 200
    assert r.json()["tutor_slug"] == vasso_tutor.tutor_slug


def test_tenancy_ignores_unverified_custom_domain(
    client, vasso_tutor, pro_teacher
):
    client.put(
        "/tutor/custom-domain",
        json={"domain": "vassoteaches.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    # No verify — request to the unverified domain must NOT resolve.
    r = client.get("/tutor/me", headers={"Host": "vassoteaches.com"})
    assert r.status_code == 404


# --- Remove --------------------------------------------------------------


def test_remove_clears_domain(client, vasso_tutor, pro_teacher, monkeypatch):
    monkeypatch.setattr(settings, "custom_domain_auto_verify", True)
    client.put(
        "/tutor/custom-domain",
        json={"domain": "gone.com"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    client.post(
        "/tutor/custom-domain/verify",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    r = client.delete(
        "/tutor/custom-domain",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 204
    after = client.get(
        "/tutor/custom-domain",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(pro_teacher)},
    )
    assert after.json()["status"] == "not_set"
