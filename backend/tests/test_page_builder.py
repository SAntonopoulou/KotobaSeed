"""Page-builder section list — default layout, replace, plan gate, owner check.

The router lives in routers/tutor_pages.py. Endpoints:
- GET  /tutor/page-sections  (public — returns default layout when none stored)
- PUT  /tutor/page-sections  (owner + Pro+)
- DELETE /tutor/page-sections (owner + Pro+)
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from backend.models import SubscriptionTier, TutorPageSection, TutorPageSectionType

from .conftest import auth_headers_for

HOST = {"Host": "vasso.kotobaseed.net"}


@pytest.fixture
def pro_teacher(db_session: Session, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(teacher_user)
    return teacher_user


@pytest.fixture
def business_teacher(db_session: Session, teacher_user):
    teacher_user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(teacher_user)
    db_session.commit()
    db_session.refresh(teacher_user)
    return teacher_user


# --- Read (public) ------------------------------------------------------


def test_get_returns_default_layout_when_none_stored(client, vasso_tutor):
    r = client.get("/tutor/page-sections", headers=HOST)
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 1
    # All defaults have id=null so the frontend knows they aren't persisted.
    assert all(item["id"] is None for item in body)
    # Default layout must start with the hero so a brand-new tutor's site
    # never looks broken.
    assert body[0]["section_type"] == "hero_portrait"
    # Positions are sequential.
    positions = [item["position"] for item in body]
    assert positions == list(range(len(positions)))


def test_get_returns_stored_sections_when_present(
    client, db_session: Session, vasso_tutor
):
    db_session.add(
        TutorPageSection(
            tutor_id=vasso_tutor.id,
            section_type=TutorPageSectionType.HERO_PORTRAIT,
            position=0,
            is_visible=True,
            content_json='{"headline": "Hello"}',
        )
    )
    db_session.commit()

    r = client.get("/tutor/page-sections", headers=HOST)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] is not None
    assert body[0]["content"] == {"headline": "Hello"}


# --- Write (Pro+ only, owner only) --------------------------------------


def test_put_replaces_sections_for_pro_owner(
    client, db_session: Session, vasso_tutor, pro_teacher
):
    payload = {
        "sections": [
            {
                "section_type": "hero_portrait",
                "is_visible": True,
                "content": {"headline": "Custom"},
            },
            {
                "section_type": "faq_accordion",
                "is_visible": False,
                "content": {"title": "FAQ", "items": [{"q": "Q1", "a": "A1"}]},
            },
        ]
    }
    r = client.put(
        "/tutor/page-sections",
        json=payload,
        headers={**HOST, **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert [s["section_type"] for s in body] == ["hero_portrait", "faq_accordion"]
    assert [s["position"] for s in body] == [0, 1]
    assert body[1]["is_visible"] is False
    # Persisted to DB.
    stored = db_session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == vasso_tutor.id)
    ).all()
    assert len(stored) == 2


def test_put_replaces_existing_sections(
    client, db_session: Session, vasso_tutor, pro_teacher
):
    db_session.add(
        TutorPageSection(
            tutor_id=vasso_tutor.id,
            section_type=TutorPageSectionType.HERO_PORTRAIT,
            position=0,
            is_visible=True,
        )
    )
    db_session.add(
        TutorPageSection(
            tutor_id=vasso_tutor.id,
            section_type=TutorPageSectionType.ABOUT_PORTRAIT,
            position=1,
            is_visible=True,
        )
    )
    db_session.commit()

    r = client.put(
        "/tutor/page-sections",
        json={"sections": [{"section_type": "cta_band", "is_visible": True, "content": {}}]},
        headers={**HOST, **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 200
    stored = db_session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == vasso_tutor.id)
    ).all()
    assert len(stored) == 1
    assert stored[0].section_type == TutorPageSectionType.CTA_BAND


def test_put_rejected_for_free_tier(client, vasso_tutor, teacher_user):
    # teacher_user is still on FREE — should hit the 402 plan gate.
    r = client.put(
        "/tutor/page-sections",
        json={"sections": []},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402


def test_put_allowed_for_business_tier(client, vasso_tutor, business_teacher):
    r = client.put(
        "/tutor/page-sections",
        json={"sections": [{"section_type": "hero_portrait", "is_visible": True, "content": {}}]},
        headers={**HOST, **auth_headers_for(business_teacher)},
    )
    assert r.status_code == 200


def test_put_requires_owner(client, vasso_tutor, student_user):
    r = client.put(
        "/tutor/page-sections",
        json={"sections": []},
        headers={**HOST, **auth_headers_for(student_user)},
    )
    # Owner check runs before plan gate, so we expect 403 not 402.
    assert r.status_code == 403


def test_delete_clears_stored_sections(
    client, db_session: Session, vasso_tutor, pro_teacher
):
    db_session.add(
        TutorPageSection(
            tutor_id=vasso_tutor.id,
            section_type=TutorPageSectionType.HERO_PORTRAIT,
            position=0,
            is_visible=True,
        )
    )
    db_session.commit()

    r = client.delete(
        "/tutor/page-sections",
        headers={**HOST, **auth_headers_for(pro_teacher)},
    )
    assert r.status_code == 204
    stored = db_session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == vasso_tutor.id)
    ).all()
    assert stored == []
    # GET now falls back to default layout.
    r2 = client.get("/tutor/page-sections", headers=HOST)
    assert r2.status_code == 200
    assert all(item["id"] is None for item in r2.json())


def test_delete_rejected_for_free_tier(client, vasso_tutor, teacher_user):
    r = client.delete(
        "/tutor/page-sections",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402
