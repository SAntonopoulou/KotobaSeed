"""Admin comps + grants — activation, revoke, expiry sweep.

Covers:
- TIER_UPGRADE flips User.subscription_tier on activate, restores on revoke
- MINUTE_PACK creates a MinutePack row on activate, deletes / clamps on revoke
- Auto-expire sweep flips ACTIVE grants past expires_at to EXPIRED + reverses
- Admin endpoints: list, create, revoke
- Non-admin denied
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from backend.models import (
    AdminGrant,
    AdminGrantKind,
    AdminGrantStatus,
    MinutePack,
    SubscriptionTier,
    Tutor,
    User,
    UserRole,
)
from backend.services import admin_grants as _ag
from backend.tests.conftest import auth_headers_for


def _seed_admin(db_session: Session) -> User:
    admin = User(
        email="admin-grants@test.com",
        hashed_password="x",
        full_name="Admin Test",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


# --- service layer ----------------------------------------------------


def test_tier_upgrade_activate_then_revoke_restores(
    db_session: Session, teacher_user: User
):
    teacher_user.subscription_tier = SubscriptionTier.FREE
    db_session.add(teacher_user)
    db_session.commit()

    import json
    grant = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.TIER_UPGRADE,
        payload_json=json.dumps({"tier": "pro"}),
    )
    db_session.add(grant)
    db_session.flush()
    _ag.activate_grant(db_session, grant)
    db_session.commit()
    db_session.refresh(teacher_user)
    assert teacher_user.subscription_tier == SubscriptionTier.PRO

    _ag.revoke_grant(db_session, grant, status_after=AdminGrantStatus.REVOKED)
    db_session.commit()
    db_session.refresh(teacher_user)
    assert teacher_user.subscription_tier == SubscriptionTier.FREE
    assert grant.status == AdminGrantStatus.REVOKED


def test_minute_pack_activate_creates_pack(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    import json
    grant = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.MINUTE_PACK,
        payload_json=json.dumps({"minutes": 2000}),
    )
    db_session.add(grant)
    db_session.flush()
    _ag.activate_grant(db_session, grant)
    db_session.commit()

    packs = db_session.exec(
        select(MinutePack).where(MinutePack.tutor_id == vasso_tutor.id)
    ).all()
    assert len(packs) == 1
    assert packs[0].minutes_remaining == 2000


def test_minute_pack_revoke_deletes_untouched_pack(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    import json
    grant = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.MINUTE_PACK,
        payload_json=json.dumps({"minutes": 500}),
    )
    db_session.add(grant)
    db_session.flush()
    _ag.activate_grant(db_session, grant)
    db_session.commit()

    _ag.revoke_grant(db_session, grant, status_after=AdminGrantStatus.REVOKED)
    db_session.commit()
    remaining = db_session.exec(select(MinutePack)).all()
    assert remaining == []


def test_sweep_expired_grants_auto_expires_past_window(
    db_session: Session, teacher_user: User
):
    teacher_user.subscription_tier = SubscriptionTier.FREE
    db_session.add(teacher_user)
    db_session.commit()

    import json
    grant = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.TIER_UPGRADE,
        payload_json=json.dumps({"tier": "pro"}),
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db_session.add(grant)
    db_session.flush()
    _ag.activate_grant(db_session, grant)
    db_session.commit()

    db_session.refresh(teacher_user)
    assert teacher_user.subscription_tier == SubscriptionTier.PRO

    n = _ag.sweep_expired_grants(db_session)
    assert n == 1
    db_session.refresh(teacher_user)
    db_session.refresh(grant)
    assert teacher_user.subscription_tier == SubscriptionTier.FREE
    assert grant.status == AdminGrantStatus.EXPIRED


# --- HTTP layer -------------------------------------------------------


def test_admin_create_grant(client, vasso_tutor: Tutor, teacher_user: User, db_session: Session):
    admin = _seed_admin(db_session)
    r = client.post(
        "/admin/grants",
        json={
            "target_email": teacher_user.email,
            "kind": "tier_upgrade",
            "payload": {"tier": "pro"},
            "reason": "Marketing comp Q1",
        },
        headers=auth_headers_for(admin),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["status"] == "active"
    assert body["kind"] == "tier_upgrade"
    db_session.refresh(teacher_user)
    assert teacher_user.subscription_tier == SubscriptionTier.PRO


def test_admin_create_grant_rejects_invalid_payload(client, db_session: Session, teacher_user: User):
    admin = _seed_admin(db_session)
    r = client.post(
        "/admin/grants",
        json={
            "target_email": teacher_user.email,
            "kind": "minute_pack",
            "payload": {"minutes": -1},  # invalid
        },
        headers=auth_headers_for(admin),
    )
    assert r.status_code == 400


def test_admin_revoke_grant(client, vasso_tutor: Tutor, teacher_user: User, db_session: Session):
    admin = _seed_admin(db_session)
    teacher_user.subscription_tier = SubscriptionTier.FREE
    db_session.add(teacher_user)
    db_session.commit()

    create_r = client.post(
        "/admin/grants",
        json={
            "target_email": teacher_user.email,
            "kind": "tier_upgrade",
            "payload": {"tier": "pro"},
        },
        headers=auth_headers_for(admin),
    )
    grant_id = create_r.json()["id"]

    r = client.post(
        f"/admin/grants/{grant_id}/revoke",
        headers=auth_headers_for(admin),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "revoked"
    db_session.refresh(teacher_user)
    assert teacher_user.subscription_tier == SubscriptionTier.FREE


def test_non_admin_cannot_create_grant(client, vasso_tutor: Tutor, teacher_user: User, student_user: User):
    r = client.post(
        "/admin/grants",
        json={
            "target_email": teacher_user.email,
            "kind": "tier_upgrade",
            "payload": {"tier": "pro"},
        },
        headers=auth_headers_for(student_user),
    )
    assert r.status_code == 403


def test_consume_lesson_credit_decrements_until_consumed(
    db_session: Session, student_user: User
):
    import json
    grant = AdminGrant(
        granted_to_user_id=student_user.id,
        granted_by_user_id=student_user.id,
        kind=AdminGrantKind.LESSON_CREDIT,
        payload_json=json.dumps({"count": 2, "max_lesson_minutes": 60}),
    )
    db_session.add(grant)
    db_session.commit()
    db_session.refresh(grant)

    # First consume succeeds.
    used1 = _ag.consume_lesson_credit(
        db_session, user_id=student_user.id, lesson_minutes=60
    )
    db_session.commit()
    assert used1 is not None
    assert _ag.count_active_lesson_credits(db_session, student_user.id) == 1

    # Second consume succeeds + flips to CONSUMED.
    used2 = _ag.consume_lesson_credit(
        db_session, user_id=student_user.id, lesson_minutes=60
    )
    db_session.commit()
    assert used2 is not None
    db_session.refresh(grant)
    assert grant.status == AdminGrantStatus.CONSUMED

    # Third consume returns None (nothing active).
    used3 = _ag.consume_lesson_credit(
        db_session, user_id=student_user.id, lesson_minutes=60
    )
    assert used3 is None


def test_consume_lesson_credit_respects_max_minutes(
    db_session: Session, student_user: User
):
    import json
    grant = AdminGrant(
        granted_to_user_id=student_user.id,
        granted_by_user_id=student_user.id,
        kind=AdminGrantKind.LESSON_CREDIT,
        payload_json=json.dumps({"count": 1, "max_lesson_minutes": 30}),
    )
    db_session.add(grant)
    db_session.commit()
    db_session.refresh(grant)

    # 60 min booking exceeds the 30 min cap → not consumed.
    out = _ag.consume_lesson_credit(
        db_session, user_id=student_user.id, lesson_minutes=60
    )
    assert out is None
    db_session.refresh(grant)
    assert grant.status == AdminGrantStatus.ACTIVE


def test_find_unused_discount_grant_skips_used(
    db_session: Session, teacher_user: User
):
    import json
    used = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.DISCOUNT,
        payload_json=json.dumps({"percent_off": 50}),
        side_effect_ids_json=json.dumps(["co_already_minted"]),
    )
    unused = AdminGrant(
        granted_to_user_id=teacher_user.id,
        granted_by_user_id=teacher_user.id,
        kind=AdminGrantKind.DISCOUNT,
        payload_json=json.dumps({"percent_off": 25}),
    )
    db_session.add_all([used, unused])
    db_session.commit()
    db_session.refresh(unused)
    found = _ag.find_unused_discount_grant(db_session, teacher_user.id)
    assert found is not None
    assert found.id == unused.id
