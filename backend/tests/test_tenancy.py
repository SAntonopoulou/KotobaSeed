"""Tenant resolution middleware + CurrentTutor dependency.

The TestClient sends `Host: testserver` by default, so each test sets the
Host header (or `X-Tenant-Slug` for the dev-override path) explicitly.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session

from backend.config import settings
from backend.models import Tutor, TutorAccountStatus, TutorPlan

from .conftest import auth_headers_for, make_tutor


def test_apex_host_has_no_tenant(client, vasso_tutor):
    """Apex hits the root marketing site — no tenant, /tutor/me 404s."""
    r = client.get("/tutor/me", headers={"Host": "kotobaseed.net"})
    assert r.status_code == 404

    # Sanity: the apex still serves the root JSON.
    r2 = client.get("/", headers={"Host": "kotobaseed.net"})
    assert r2.status_code == 200


def test_subdomain_resolves_to_tutor(client, vasso_tutor):
    r = client.get("/tutor/me", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tutor_slug"] == "vasso"
    assert body["display_name"] == "Vasso"


def test_custom_domain_resolves_to_tutor(client, vasso_tutor, db_session):
    # Tenancy only honours verified custom domains — mark this one as
    # verified so the existing fixture (which seeds the column directly)
    # still resolves the way the rest of the suite expects.
    from datetime import UTC, datetime

    vasso_tutor.custom_domain_verified_at = datetime.now(UTC)
    db_session.add(vasso_tutor)
    db_session.commit()
    r = client.get("/tutor/me", headers={"Host": "greekwithvasso.com"})
    assert r.status_code == 200, r.text
    assert r.json()["tutor_slug"] == "vasso"


def test_unverified_custom_domain_does_not_resolve(client, vasso_tutor):
    # The fixture's custom_domain is unverified by default — must 404 until
    # the tutor goes through /tutor/custom-domain/verify.
    r = client.get("/tutor/me", headers={"Host": "greekwithvasso.com"})
    assert r.status_code == 404


def test_host_is_case_insensitive(client, vasso_tutor):
    r = client.get("/tutor/me", headers={"Host": "VASSO.KOTOBASEED.NET"})
    assert r.status_code == 200


def test_host_with_port_strips_port(client, vasso_tutor):
    r = client.get("/tutor/me", headers={"Host": "vasso.kotobaseed.net:8000"})
    assert r.status_code == 200


@pytest.mark.parametrize("reserved", ["www", "api", "admin"])
def test_reserved_subdomain_has_no_tenant_even_if_slug_exists(
    reserved, client, db_session: Session, teacher_user
):
    """A tutor row claiming a reserved slug must NOT resolve at that subdomain."""
    make_tutor(db_session, user=teacher_user, slug=reserved, display_name=reserved.title())
    r = client.get("/tutor/me", headers={"Host": f"{reserved}.kotobaseed.net"})
    assert r.status_code == 404


def test_unknown_subdomain_404s(client, vasso_tutor):
    r = client.get("/tutor/me", headers={"Host": "ghost.kotobaseed.net"})
    assert r.status_code == 404


def test_dev_override_header_resolves_tenant(client, vasso_tutor):
    """Environment is 'test' (set by conftest), so X-Tenant-Slug is honored."""
    r = client.get(
        "/tutor/me",
        headers={"Host": "testserver", "X-Tenant-Slug": "vasso"},
    )
    assert r.status_code == 200
    assert r.json()["tutor_slug"] == "vasso"


def test_tenant_header_honored_in_production(client, vasso_tutor, monkeypatch):
    """X-Tenant-Slug is honored in every environment, including production.

    The header is *informational* — it tells the backend which tutor's
    data to scope to. It is NOT an authorization signal: every owner-only
    endpoint enforces ``tutor.user_id == current.id`` independently, so
    forging this header cannot escalate access. Honoring it in prod is
    what lets the SPA on a tutor subdomain talk to api.kotobaseed.net
    (which the Host header alone can't disambiguate — ``api`` is a
    reserved subdomain).
    """
    monkeypatch.setattr(settings, "environment", "production")
    r = client.get(
        "/tutor/me",
        headers={"Host": "api.kotobaseed.net", "X-Tenant-Slug": "vasso"},
    )
    assert r.status_code == 200
    assert r.json()["tutor_slug"] == "vasso"


def test_nested_subdomain_is_no_tenant(client, db_session: Session, teacher_user):
    """foo.bar.kotobaseed.net — refuse rather than guess which label is the slug."""
    # Make sure no row with this exact slug exists either.
    r = client.get("/tutor/me", headers={"Host": "foo.bar.kotobaseed.net"})
    assert r.status_code == 404


def test_paused_tutor_still_resolves(client, db_session: Session, teacher_user):
    """Account-status filtering belongs at the route level, not in tenant resolution.
    A paused tutor's site can still render a 'this site is paused' page.
    """
    tutor = Tutor(
        user_id=teacher_user.id,
        tutor_slug="paused",
        display_name="Paused Tutor",
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.PAUSED_DORMANT,
    )
    db_session.add(tutor)
    db_session.commit()

    r = client.get("/tutor/me", headers={"Host": "paused.kotobaseed.net"})
    assert r.status_code == 200
    assert r.json()["account_status"] == "paused_dormant"


def test_patch_tutor_me_requires_owner(client, db_session: Session, vasso_tutor, student_user):
    """A logged-in non-owner can't edit the tutor profile."""
    r = client.patch(
        "/tutor/me",
        json={"bio": "hacked"},
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(student_user),
        },
    )
    assert r.status_code == 403


def test_patch_tutor_me_requires_auth(client, vasso_tutor):
    r = client.patch(
        "/tutor/me",
        json={"bio": "anything"},
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code in (401, 403)


def test_patch_tutor_me_updates_profile(client, db_session: Session, vasso_tutor, teacher_user):
    """Update writes Tutor.display_name AND User.bio/avatar_url/languages."""
    r = client.patch(
        "/tutor/me",
        json={
            "display_name": "Vasso (updated)",
            "bio": "Greek tutor based in Athens.",
            "languages_taught": "el,en",
            "photo_url": "https://cdn.example.com/vasso.jpg",
        },
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "Vasso (updated)"
    assert body["bio"] == "Greek tutor based in Athens."
    assert body["languages_taught"] == "el,en"
    assert body["photo_url"] == "https://cdn.example.com/vasso.jpg"

    db_session.refresh(vasso_tutor)
    db_session.refresh(teacher_user)
    assert vasso_tutor.display_name == "Vasso (updated)"
    # Identity fields landed on the User row, not the Tutor.
    assert teacher_user.bio == "Greek tutor based in Athens."
    assert teacher_user.languages == "el,en"
    assert teacher_user.avatar_url == "https://cdn.example.com/vasso.jpg"


def test_patch_tutor_me_ignores_unsent_fields(client, db_session: Session, vasso_tutor, teacher_user):
    """Partial update — User.bio stays untouched if the request only sends display_name."""
    teacher_user.bio = "original bio"
    db_session.add(teacher_user)
    db_session.commit()

    r = client.patch(
        "/tutor/me",
        json={"display_name": "New Name"},
        headers={
            "Host": "vasso.kotobaseed.net",
            **auth_headers_for(teacher_user),
        },
    )
    assert r.status_code == 200
    db_session.refresh(vasso_tutor)
    db_session.refresh(teacher_user)
    assert vasso_tutor.display_name == "New Name"
    assert teacher_user.bio == "original bio"


def test_get_tutor_me_pulls_bio_from_user(client, db_session: Session, vasso_tutor, teacher_user):
    """The single-identity rule: editing User.bio shows up on the tutor site."""
    teacher_user.bio = "Edited via marketplace profile."
    teacher_user.avatar_url = "https://cdn.example.com/avatar.jpg"
    teacher_user.languages = "el, en"
    db_session.add(teacher_user)
    db_session.commit()

    r = client.get("/tutor/me", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200
    body = r.json()
    assert body["bio"] == "Edited via marketplace profile."
    assert body["photo_url"] == "https://cdn.example.com/avatar.jpg"
    assert body["languages_taught"] == "el, en"
