"""Theme listing endpoint + plan-gated theme write.

Themes are a curated bundle exposed via GET /tutor/themes (public). PATCH
/tutor/me with `theme` requires Pro+; free/plus tutors get 402.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session

from backend.models import SubscriptionTier

from .conftest import auth_headers_for

HOST = {"Host": "vasso.kotobaseed.net"}


@pytest.fixture
def pro_teacher(db_session: Session, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(teacher_user)
    return teacher_user


def test_list_themes_is_public(client):
    r = client.get("/tutor/themes")
    assert r.status_code == 200
    body = r.json()
    keys = {item["key"] for item in body}
    # Must at least include the documented bundles.
    assert {"sage", "midnight", "sakura", "sunlight", "aegean", "slate"}.issubset(keys)
    # Every theme has label + description for the picker.
    for item in body:
        assert item["label"]
        assert item["description"]


def test_default_theme_is_sage(client, vasso_tutor):
    r = client.get("/tutor/me", headers=HOST)
    assert r.status_code == 200
    assert r.json()["theme"] == "sage"


def test_patch_theme_requires_pro(client, vasso_tutor, teacher_user):
    r = client.patch(
        "/tutor/me",
        json={"theme": "midnight"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402


def test_patch_theme_writes_for_pro_owner(client, vasso_tutor, pro_teacher):
    r = client.patch(
        "/tutor/me",
        json={"theme": "midnight"},
        headers={**HOST, **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["theme"] == "midnight"
    # Public read reflects the change.
    public = client.get("/tutor/me", headers=HOST)
    assert public.json()["theme"] == "midnight"


def test_patch_theme_rejects_unknown_key(client, vasso_tutor, pro_teacher):
    r = client.patch(
        "/tutor/me",
        json={"theme": "neon-disco"},
        headers={**HOST, **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 400
