"""Custom theme orders + theme application + team-leave restore.

Covers:
- Pricing math (Pro 30% off, Business 40% off, deposit = half)
- Order create → status DRAFT, both halves recorded
- State machine: rejection of out-of-order transitions
- Revision cap (max 2)
- Tutor self-cancel
- Webhook deposit + final transitions
- Theme application overwrites TutorPageSection rows
- Personal theme restored on team-leave (team_protection integration)
"""

from __future__ import annotations

import json

from sqlmodel import Session, select

from backend.models import (
    CustomTheme,
    CustomThemeOrder,
    CustomThemeOrderStatus,
    CustomThemePackage,
    CustomThemeStatus,
    SubscriptionTier,
    Tutor,
    TutorPageSection,
    TutorPageSectionType,
    User,
)
from backend.routers import custom_themes as _ct_router
from backend.services import (
    custom_themes as _ct_svc,
    team_protection as _protection,
    teams as _teams,
)
from backend.tests.conftest import auth_headers_for

HOST = {"Host": "kotobaseed.net"}


# --- pricing ----------------------------------------------------------


def test_price_for_standard_with_pro_discount():
    total, deposit, pct = _ct_svc.price_for(
        CustomThemePackage.STANDARD, SubscriptionTier.PRO
    )
    assert pct == 30
    assert total == 104_930  # €1,049.30 — base 149900 * 0.70 rounded
    assert deposit == total // 2


def test_price_for_standard_with_business_discount():
    total, deposit, pct = _ct_svc.price_for(
        CustomThemePackage.STANDARD, SubscriptionTier.BUSINESS
    )
    assert pct == 40
    assert total == int(round(149_900 * 0.60))
    assert deposit == total // 2


def test_price_for_premium_with_pro_discount():
    total, _, pct = _ct_svc.price_for(
        CustomThemePackage.PREMIUM, SubscriptionTier.PRO
    )
    assert pct == 30
    assert total == int(round(249_900 * 0.70))


# --- order lifecycle --------------------------------------------------


def test_create_order_personal(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    r = client.post(
        "/custom-themes",
        json={
            "package": "standard",
            "apply_to_team": False,
            "brief": {"tone": "warm", "language_focus": "Greek"},
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["status"] == "draft"
    assert body["discount_percent"] == 30
    assert body["total_cents"] == body["deposit_cents"] + body["final_cents"]


def test_request_revision_caps_at_two(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    # Build an order manually, push it to CONCEPTS_READY.
    order = CustomThemeOrder(
        ordering_user_id=teacher_user.id,
        target_tutor_id=vasso_tutor.id,
        package=CustomThemePackage.STANDARD,
        status=CustomThemeOrderStatus.CONCEPTS_READY,
        deposit_cents=74_950,
        final_cents=74_950,
        brief_payload_json="{}",
        concept_previews_json=json.dumps(
            [{"label": "A", "image_url": "x"}, {"label": "B", "image_url": "y"}, {"label": "C", "image_url": "z"}]
        ),
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    # Two revision rounds — both succeed.
    order_id = order.id
    for i in range(2):
        r = client.post(
            f"/custom-themes/{order_id}/request-revision",
            json={"notes": f"round {i+1} adjustments"},
            headers={**HOST, **auth_headers_for(teacher_user)},
        )
        assert r.status_code == 200, r.json()
        # Mark CONCEPTS_READY again so the next revision is allowed.
        db_session.expire_all()
        fresh = db_session.get(CustomThemeOrder, order_id)
        fresh.status = CustomThemeOrderStatus.CONCEPTS_READY
        db_session.add(fresh)
        db_session.commit()

    # Third revision is rejected with 402.
    r = client.post(
        f"/custom-themes/{order.id}/request-revision",
        json={"notes": "one more please"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402


def test_select_concept_transitions_to_approved(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    order = CustomThemeOrder(
        ordering_user_id=teacher_user.id,
        target_tutor_id=vasso_tutor.id,
        package=CustomThemePackage.STANDARD,
        status=CustomThemeOrderStatus.CONCEPTS_READY,
        deposit_cents=74_950,
        final_cents=74_950,
        brief_payload_json="{}",
        concept_previews_json=json.dumps(
            [{"label": "A", "image_url": "x"}, {"label": "B", "image_url": "y"}, {"label": "C", "image_url": "z"}]
        ),
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    r = client.post(
        f"/custom-themes/{order.id}/select",
        json={"concept_index": 1},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    assert r.json()["selected_concept_index"] == 1


def test_self_cancel_blocked_after_delivered(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    order = CustomThemeOrder(
        ordering_user_id=teacher_user.id,
        target_tutor_id=vasso_tutor.id,
        package=CustomThemePackage.STANDARD,
        status=CustomThemeOrderStatus.DELIVERED,
        deposit_cents=10,
        final_cents=10,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    r = client.post(
        f"/custom-themes/{order.id}/cancel",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 409


def test_webhook_deposit_transitions(db_session: Session, vasso_tutor: Tutor, teacher_user: User):
    order = CustomThemeOrder(
        ordering_user_id=teacher_user.id,
        target_tutor_id=vasso_tutor.id,
        package=CustomThemePackage.STANDARD,
        status=CustomThemeOrderStatus.DRAFT,
        deposit_cents=10,
        final_cents=10,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    _ct_router.handle_deposit_paid(
        db_session,
        {
            "id": "cs_test_dep",
            "payment_intent": "pi_test_dep",
            "metadata": {"type": "custom_theme_deposit", "order_id": str(order.id)},
        },
    )
    db_session.refresh(order)
    assert order.status == CustomThemeOrderStatus.DEPOSIT_PAID
    assert order.deposit_paid_at is not None


# --- theme application -----------------------------------------------


def test_apply_personal_theme_writes_sections(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    theme = CustomTheme(
        owner_user_id=teacher_user.id,
        name="Vasso's classic",
        design_payload_json=json.dumps(
            [
                {"section_type": "hero_portrait", "position": 0, "is_visible": True, "content": {"headline": "Hi"}},
                {"section_type": "about_portrait", "position": 1, "is_visible": True, "content": {"body": "About me"}},
            ]
        ),
        status=CustomThemeStatus.DRAFT,
    )
    db_session.add(theme)
    db_session.commit()
    db_session.refresh(theme)
    updated = _ct_svc.apply_theme(session=db_session, theme=theme, commit=True)
    assert updated == [vasso_tutor.id]

    sections = db_session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == vasso_tutor.id)
    ).all()
    assert len(sections) == 2
    assert {s.section_type for s in sections} == {
        TutorPageSectionType.HERO_PORTRAIT,
        TutorPageSectionType.ABOUT_PORTRAIT,
    }
    db_session.refresh(vasso_tutor)
    assert vasso_tutor.active_theme_id == theme.id


def test_apply_team_theme_writes_for_every_member(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    # Seed a second tutor in the team.
    member_user = User(email="member@example.com", hashed_password="x", full_name="Member")
    db_session.add(member_user)
    db_session.commit()
    db_session.refresh(member_user)
    member_tutor = Tutor(
        user_id=member_user.id,
        tutor_slug="member-tutor",
        display_name="Member",
        team_id=team.id,
    )
    db_session.add(member_tutor)
    db_session.commit()
    db_session.refresh(member_tutor)

    theme = CustomTheme(
        owner_team_id=team.id,
        name="LingoSchool spring",
        design_payload_json=json.dumps(
            [{"section_type": "hero_portrait", "position": 0, "is_visible": True}]
        ),
        status=CustomThemeStatus.DRAFT,
    )
    db_session.add(theme)
    db_session.commit()
    db_session.refresh(theme)
    updated = _ct_svc.apply_theme(session=db_session, theme=theme, commit=True)
    assert set(updated) == {vasso_tutor.id, member_tutor.id}


# --- team leave restores personal theme ------------------------------


def test_leave_team_restores_personal_theme(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    # Member with a personal READY theme.
    member_user = User(email="resto@example.com", hashed_password="x", full_name="Resto")
    db_session.add(member_user)
    db_session.commit()
    db_session.refresh(member_user)
    member_tutor = Tutor(
        user_id=member_user.id,
        tutor_slug="resto-tutor",
        display_name="Resto",
        team_id=team.id,
    )
    db_session.add(member_tutor)
    db_session.commit()
    db_session.refresh(member_tutor)
    personal = CustomTheme(
        owner_user_id=member_user.id,
        name="My personal",
        design_payload_json=json.dumps(
            [{"section_type": "hero_portrait", "position": 0, "is_visible": True}]
        ),
        status=CustomThemeStatus.READY,
    )
    db_session.add(personal)
    db_session.commit()
    db_session.refresh(personal)

    _protection.process_tutor_left_team(member_tutor, team, db_session, commit=True)
    db_session.refresh(member_tutor)
    assert member_tutor.team_id is None
    # Active theme switched to the personal one.
    assert member_tutor.active_theme_id == personal.id
    sections = db_session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == member_tutor.id)
    ).all()
    assert len(sections) == 1
