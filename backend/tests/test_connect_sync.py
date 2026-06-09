"""Stripe Connect unification — the Tutor.stripe_connect_account_id is
the single source of truth, mirrored onto User.stripe_account_id so the
apex marketplace flows see the same Stripe identity.

Tests:
- service layer mirrors the tutor's Connect id + capability flags onto User
- service is idempotent when User already matches
- account.updated webhook syncs both Tutor account_status and User flags
"""

from __future__ import annotations

from sqlmodel import Session

from backend.models import Tutor, TutorAccountStatus, User
from backend.routers import pledges
from backend.services import connect_sync


def test_sync_mirrors_account_id(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    vasso_tutor.stripe_connect_account_id = "acct_test_new"
    db_session.add(vasso_tutor)
    db_session.commit()

    connect_sync.sync_tutor_to_user(vasso_tutor, db_session, commit=True)
    db_session.refresh(teacher_user)
    assert teacher_user.stripe_account_id == "acct_test_new"


def test_sync_with_capability_flags(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    vasso_tutor.stripe_connect_account_id = "acct_test_caps"
    db_session.add(vasso_tutor)
    db_session.commit()

    connect_sync.sync_tutor_to_user(
        vasso_tutor,
        db_session,
        charges_enabled=True,
        payouts_enabled=True,
        commit=True,
    )
    db_session.refresh(teacher_user)
    assert teacher_user.stripe_account_id == "acct_test_caps"
    assert teacher_user.charges_enabled is True
    assert teacher_user.payouts_enabled is True


def test_sync_is_idempotent(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    vasso_tutor.stripe_connect_account_id = "acct_test_same"
    teacher_user.stripe_account_id = "acct_test_same"
    teacher_user.charges_enabled = True
    teacher_user.payouts_enabled = True
    db_session.add_all([vasso_tutor, teacher_user])
    db_session.commit()

    connect_sync.sync_tutor_to_user(
        vasso_tutor,
        db_session,
        charges_enabled=True,
        payouts_enabled=True,
        commit=True,
    )
    db_session.refresh(teacher_user)
    assert teacher_user.stripe_account_id == "acct_test_same"


def test_account_updated_webhook_syncs_user_flags(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    """account.updated firing for a tutor's Connect account should flip
    BOTH the Tutor.account_status AND the User capability flags so the
    marketplace flow on the apex sees the tutor as ready."""
    vasso_tutor.stripe_connect_account_id = "acct_test_webhook"
    vasso_tutor.account_status = TutorAccountStatus.PAUSED_KYC
    teacher_user.charges_enabled = False
    teacher_user.payouts_enabled = False
    db_session.add_all([vasso_tutor, teacher_user])
    db_session.commit()

    pledges.handle_account_updated(
        db_session,
        {
            "id": "acct_test_webhook",
            "details_submitted": True,
            "charges_enabled": True,
            "payouts_enabled": True,
        },
    )
    db_session.refresh(vasso_tutor)
    db_session.refresh(teacher_user)
    assert vasso_tutor.account_status == TutorAccountStatus.ACTIVE
    assert teacher_user.stripe_account_id == "acct_test_webhook"
    assert teacher_user.charges_enabled is True
    assert teacher_user.payouts_enabled is True
