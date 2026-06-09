"""Tests for the new TutorVerification flow.

Covers:
- Owner can submit / list / withdraw their own credentials
- Identity kind is rejected (auto-granted by Stripe Connect)
- Duplicate (kind, language) submissions blocked
- Free tutors get 402 (Pro+ gate)
- Public endpoint exposes only APPROVED rows
- Admin approve / reject flow
"""

from __future__ import annotations

from sqlmodel import Session

from backend.models import (
    SubscriptionTier,
    Tutor,
    TutorVerification,
    TutorVerificationKind,
    User,
    UserRole,
    VerificationStatus,
)

HOST = {"Host": "vasso.kotobaseed.net"}


# -- helpers ------------------------------------------------------------


def _make_pro(db_session: Session, user: User) -> None:
    user.subscription_tier = SubscriptionTier.PRO
    db_session.add(user)
    db_session.commit()


def _make_admin(db_session: Session) -> User:
    user = User(
        email="admin-verif@test.com",
        hashed_password="x",
        full_name="Test Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# -- owner endpoints ----------------------------------------------------


def test_free_tutor_blocked_from_submitting(
    client, vasso_tutor: Tutor, teacher_user: User
):
    from backend.tests.conftest import auth_headers_for

    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "language_proficiency",
            "description": "DELE C2",
            "language": "Spanish",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402


def test_pro_tutor_can_submit_and_list(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)

    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "language_proficiency",
            "description": "DELE C2",
            "language": "Spanish",
            "evidence_file_path": "https://example.com/dele.pdf",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["status"] == "pending"
    assert body["language"] == "Spanish"

    r = client.get(
        "/tutor/verifications",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1 and rows[0]["id"] == body["id"]


def test_language_kind_requires_language(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)

    r = client.post(
        "/tutor/verifications",
        json={"kind": "language_proficiency", "description": "DELE C2"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_identity_kind_is_rejected_for_manual_submission(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)

    r = client.post(
        "/tutor/verifications",
        json={"kind": "identity", "description": "passport"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_duplicate_pending_submission_blocked(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)

    payload = {
        "kind": "language_proficiency",
        "description": "DELE C2",
        "language": "Spanish",
    }
    r1 = client.post(
        "/tutor/verifications",
        json=payload,
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/tutor/verifications",
        json=payload,
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r2.status_code == 409


def test_owner_can_withdraw(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)
    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "teaching_credential",
            "description": "CELTA",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    vid = r.json()["id"]
    r = client.delete(
        f"/tutor/verifications/{vid}",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    assert db_session.get(TutorVerification, vid) is None


# -- public endpoint ----------------------------------------------------


def test_public_lists_only_approved(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    # Seed: one APPROVED + one PENDING for this tutor.
    db_session.add_all(
        [
            TutorVerification(
                tutor_id=vasso_tutor.id,
                kind=TutorVerificationKind.LANGUAGE_PROFICIENCY,
                description="Greek native",
                language="Greek",
                status=VerificationStatus.APPROVED,
            ),
            TutorVerification(
                tutor_id=vasso_tutor.id,
                kind=TutorVerificationKind.TEACHING_CREDENTIAL,
                description="CELTA",
                status=VerificationStatus.PENDING,
            ),
        ]
    )
    db_session.commit()

    r = client.get("/tutor/verifications/public", headers=HOST)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["status"] == "approved"
    assert rows[0]["language"] == "Greek"


# -- admin review -------------------------------------------------------


def test_admin_approve_flips_status(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)
    admin = _make_admin(db_session)

    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "teaching_credential",
            "description": "CELTA",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    vid = r.json()["id"]

    r = client.post(
        f"/admin/tutor-verifications/{vid}/approve",
        json={"notes": "Looks good"},
        headers=auth_headers_for(admin),
    )
    assert r.status_code == 200, r.json()
    assert r.json()["status"] == "approved"
    assert r.json()["review_notes"] == "Looks good"


def test_admin_reject_flips_status(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)
    admin = _make_admin(db_session)

    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "language_proficiency",
            "description": "DELE C2",
            "language": "Spanish",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    vid = r.json()["id"]

    r = client.post(
        f"/admin/tutor-verifications/{vid}/reject",
        json={"notes": "Need clearer scan"},
        headers=auth_headers_for(admin),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"


def test_admin_cannot_re_review(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    from backend.tests.conftest import auth_headers_for

    _make_pro(db_session, teacher_user)
    admin = _make_admin(db_session)

    r = client.post(
        "/tutor/verifications",
        json={
            "kind": "teaching_credential",
            "description": "CELTA",
        },
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    vid = r.json()["id"]

    client.post(
        f"/admin/tutor-verifications/{vid}/approve",
        json={"notes": None},
        headers=auth_headers_for(admin),
    )
    r2 = client.post(
        f"/admin/tutor-verifications/{vid}/reject",
        json={"notes": "changed my mind"},
        headers=auth_headers_for(admin),
    )
    assert r2.status_code == 409
