"""Tests for the pledge webhook flow.

We don't go through Stripe (it would require live signatures); we call the
internal handler functions directly with synthetic event payloads. This
catches the business-logic bugs without depending on Stripe.

What's covered:
- Pledge capture updates funding + sends notifications
- Hitting the funding goal auto-transitions FUNDING → SUCCESSFUL
- Tip handling adds to total_tipped_amount and notifies the teacher
- Already-captured pledges are not double-counted (idempotency)
- account.updated holds projects when charges_enabled becomes False
- charge.refunded reverses the funding and marks pledge REFUNDED
"""

from __future__ import annotations

from sqlmodel import Session, select

from backend.models import (
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    User,
)
from backend.routers.pledges import (
    handle_account_updated,
    handle_charge_refunded,
    handle_checkout_session_completed,
)


def _make_project(db_session: Session, teacher: User, *, goal: int = 10_000) -> Project:
    project = Project(
        title="Demo project",
        description="A test project",
        language="Greek",
        level="A1",
        funding_goal=goal,
        teacher_id=teacher.id,
        status=ProjectStatus.FUNDING,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _make_pending_pledge(
    db_session: Session, project: Project, student: User, *, amount: int = 1_000
) -> Pledge:
    pledge = Pledge(
        user_id=student.id,
        project_id=project.id,
        amount=amount,
        status=PledgeStatus.PENDING,
        checkout_session_id=f"cs_test_{project.id}_{student.id}",
    )
    db_session.add(pledge)
    db_session.commit()
    db_session.refresh(pledge)
    return pledge


class TestCheckoutSessionCompleted:
    def test_pending_pledge_captures_and_credits_project(
        self, db_session, teacher_user, student_user
    ):
        project = _make_project(db_session, teacher_user)
        pledge = _make_pending_pledge(db_session, project, student_user, amount=2_500)

        handle_checkout_session_completed(
            db_session,
            {
                "client_reference_id": str(pledge.id),
                "payment_intent": "pi_test_123",
            },
        )

        db_session.refresh(pledge)
        db_session.refresh(project)

        assert pledge.status == PledgeStatus.CAPTURED
        assert pledge.payment_intent_id == "pi_test_123"
        assert project.current_funding == 2_500

        # Teacher gets a "new pledge" notification
        notifications = db_session.exec(
            select(Notification).where(Notification.user_id == teacher_user.id)
        ).all()
        assert any("pledge of" in n.message for n in notifications)

    def test_reaching_goal_transitions_to_successful(self, db_session, teacher_user, student_user):
        project = _make_project(db_session, teacher_user, goal=5_000)
        pledge = _make_pending_pledge(db_session, project, student_user, amount=5_000)

        handle_checkout_session_completed(
            db_session,
            {
                "client_reference_id": str(pledge.id),
                "payment_intent": "pi_full_fund",
            },
        )

        db_session.refresh(project)

        assert project.status == ProjectStatus.SUCCESSFUL
        assert project.funded_at is not None

        # Teacher gets BOTH a pledge notification AND a fully-funded notification
        notifications = db_session.exec(
            select(Notification).where(Notification.user_id == teacher_user.id)
        ).all()
        messages = [n.message for n in notifications]
        assert any("fully funded" in m for m in messages)

    def test_idempotent_for_already_captured_pledge(self, db_session, teacher_user, student_user):
        project = _make_project(db_session, teacher_user)
        pledge = _make_pending_pledge(db_session, project, student_user, amount=1_000)

        # First webhook delivery
        handle_checkout_session_completed(
            db_session,
            {"client_reference_id": str(pledge.id), "payment_intent": "pi_1"},
        )
        db_session.refresh(project)
        funding_after_first = project.current_funding

        # Second delivery for the same pledge — should NOT double-credit
        handle_checkout_session_completed(
            db_session,
            {"client_reference_id": str(pledge.id), "payment_intent": "pi_1"},
        )
        db_session.refresh(project)

        assert project.current_funding == funding_after_first

    def test_missing_client_reference_id_is_a_noop(self, db_session, teacher_user, student_user):
        project = _make_project(db_session, teacher_user)
        _ = _make_pending_pledge(db_session, project, student_user, amount=1_000)

        # No client_reference_id → handler logs an error and returns,
        # without touching DB state.
        handle_checkout_session_completed(db_session, {})

        db_session.refresh(project)
        assert project.current_funding == 0

    def test_tip_metadata_credits_tipped_amount(self, db_session, teacher_user, student_user):
        project = _make_project(db_session, teacher_user)

        handle_checkout_session_completed(
            db_session,
            {
                "metadata": {
                    "type": "tip",
                    "teacher_id": str(teacher_user.id),
                    "project_id": str(project.id),
                    "user_id": str(student_user.id),
                },
                "amount_total": 500,
            },
        )

        db_session.refresh(project)
        assert project.total_tipped_amount == 500

        # Teacher gets a tip notification
        notifications = db_session.exec(
            select(Notification).where(Notification.user_id == teacher_user.id)
        ).all()
        assert any("tip of" in n.message for n in notifications)


class TestAccountUpdated:
    def test_disabled_charges_puts_funding_projects_on_hold(self, db_session, teacher_user):
        teacher_user.stripe_account_id = "acct_test_123"
        teacher_user.charges_enabled = True
        teacher_user.payouts_enabled = True
        db_session.add(teacher_user)
        db_session.commit()

        funding_project = _make_project(db_session, teacher_user)
        completed_project = _make_project(db_session, teacher_user)
        completed_project.status = ProjectStatus.COMPLETED
        db_session.add(completed_project)
        db_session.commit()

        handle_account_updated(
            db_session,
            {
                "id": "acct_test_123",
                "charges_enabled": False,
                "payouts_enabled": False,
            },
        )

        db_session.refresh(funding_project)
        db_session.refresh(completed_project)
        db_session.refresh(teacher_user)

        assert teacher_user.charges_enabled is False
        # Funding project gets held; completed project is untouched
        assert funding_project.status == ProjectStatus.ON_HOLD
        assert completed_project.status == ProjectStatus.COMPLETED


class TestChargeRefunded:
    def test_refund_reverses_funding_and_marks_pledge_refunded(
        self, db_session, teacher_user, student_user
    ):
        project = _make_project(db_session, teacher_user, goal=10_000)
        pledge = _make_pending_pledge(db_session, project, student_user, amount=3_000)
        # Walk it through capture first so we have something to refund
        handle_checkout_session_completed(
            db_session,
            {"client_reference_id": str(pledge.id), "payment_intent": "pi_xyz"},
        )

        db_session.refresh(project)
        assert project.current_funding == 3_000

        # Now the refund
        handle_charge_refunded(db_session, {"payment_intent": "pi_xyz"})

        db_session.refresh(pledge)
        db_session.refresh(project)

        assert pledge.status == PledgeStatus.REFUNDED
        assert project.current_funding == 0

    def test_double_refund_is_idempotent(self, db_session, teacher_user, student_user):
        project = _make_project(db_session, teacher_user)
        pledge = _make_pending_pledge(db_session, project, student_user, amount=1_000)
        handle_checkout_session_completed(
            db_session,
            {"client_reference_id": str(pledge.id), "payment_intent": "pi_dup"},
        )
        handle_charge_refunded(db_session, {"payment_intent": "pi_dup"})

        db_session.refresh(project)
        funding_after_first_refund = project.current_funding

        # Second refund event — should NOT subtract again
        handle_charge_refunded(db_session, {"payment_intent": "pi_dup"})
        db_session.refresh(project)

        assert project.current_funding == funding_after_first_refund


class TestAuthSmoke:
    """Sanity check the test fixtures actually work end-to-end."""

    def test_register_and_login(self, client):
        register_payload = {
            "email": "newuser@example.com",
            "password": "verysecret",
            "full_name": "New User",
        }
        r = client.post("/auth/register", json=register_payload)
        assert r.status_code == 200, r.text

        r = client.post(
            "/auth/token",
            data={
                "username": "newuser@example.com",
                "password": "verysecret",
            },
        )
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()
