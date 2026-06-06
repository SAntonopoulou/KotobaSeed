"""Per-grading payments + credits: refill on subscription lifecycle,
spending credits, Stripe checkout for grading, awaiting-payment flag."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from backend.models import (
    HomeworkAssignment,
    HomeworkGradingPayment,
    HomeworkSubmission,
    HomeworkTemplate,
    StudentGradingCreditBalance,
    StudentTutorSubscription,
    SubscriptionTier,
    TutorAccountStatus,
    TutorSubscriptionPlan,
    TutorSubscriptionStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash
from backend.services import grading_credits

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _h(u):
    return {"Host": HOST, **auth_headers_for(u)}


def _student(db_session, email="grader@x.com"):
    u = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name="G",
        role=UserRole.STUDENT,
        is_active=True,
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def active_tutor(db_session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    vasso_tutor.stripe_connect_account_id = "acct_test"
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


@pytest.fixture
def stub_stripe(monkeypatch):
    sessions: list[dict] = []

    def fake_create(**kwargs):
        sessions.append(kwargs)
        kwargs.pop("api_key", None)

        class _S:
            url = "https://stripe.test/grading"
            id = f"cs_grade_{len(sessions)}"

        return _S()

    import backend.routers.homework as hwm

    # The grading checkout lives inside the function — monkeypatch the
    # global stripe.checkout.Session.create instead so it's caught
    # regardless of import path.
    monkeypatch.setattr(hwm, "log", hwm.log)  # noop; ensures attr exists
    import stripe as _stripe

    monkeypatch.setattr(_stripe.checkout.Session, "create", fake_create)
    return sessions


def _make_paid_assignment(client, teacher_user, db_session, *, grading_price=500):
    """Create a template charging for grading + assign it to a fresh student."""
    template = HomeworkTemplate(
        tutor_id=db_session.exec(
            HomeworkTemplate.__table__.select().limit(0)  # placeholder
        ).first() and 0 or 0,
        title="Paid grading drill",
        questions_json='[{"id":"q1","type":"short_answer","prompt":"Why Greek?","points":5}]',
        is_active=True,
        grading_price_cents=grading_price,
    )
    # We rely on the active_tutor fixture's id — caller sets it.
    return template


def _setup_paid_template(active_tutor, db_session, *, grading_price=500):
    template = HomeworkTemplate(
        tutor_id=active_tutor.id,
        title="Pay-to-grade drill",
        questions_json='[{"id":"q1","type":"short_answer","prompt":"Why?","points":5}]',
        is_active=True,
        grading_price_cents=grading_price,
        currency="eur",
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


# --- Grading price snapshot + grading_paid logic ---------------------


def test_assignment_snapshots_grading_price(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=750)
    student = _student(db_session, "snap@x.com")
    r = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    )
    assert r.status_code == 201
    aid = r.json()["id"]
    a = db_session.get(HomeworkAssignment, aid)
    assert a.grading_price_cents == 750
    # Edit the template — existing assignment keeps its snapshot.
    client.patch(
        f"/tutor/homework/templates/{template.id}",
        json={"grading_price_cents": 100},
        headers=_h(teacher_user),
    )
    db_session.refresh(a)
    assert a.grading_price_cents == 750


def test_short_answer_submission_marks_awaiting_payment_when_priced(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "await@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    r = client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "something"}},
        headers=auth_headers_for(student),
    )
    body = r.json()
    assert body["submission_awaiting_payment"] is True
    sub = db_session.exec(
        HomeworkSubmission.__table__.select().where(
            HomeworkSubmission.__table__.c.assignment_id == a["id"]
        )
    ).first()
    assert sub.grading_paid is False


def test_short_answer_submission_no_payment_needed_when_price_zero(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=0)
    student = _student(db_session, "free@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    r = client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "something"}},
        headers=auth_headers_for(student),
    )
    assert r.json()["submission_awaiting_payment"] is False


def test_tutor_needs_review_excludes_unpaid_submissions(
    client, active_tutor, teacher_user, db_session
):
    """Tutor's dashboard list flags submissions as needs_review ONLY when
    grading_paid is True."""
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "unpaid@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "ugh"}},
        headers=auth_headers_for(student),
    )
    r = client.get(
        "/tutor/homework/assignments", headers=_h(teacher_user)
    )
    item = next(it for it in r.json() if it["id"] == a["id"])
    assert item["submission_needs_review"] is False
    assert item["submission_awaiting_payment"] is True


# --- Credit refill service -------------------------------------------


def test_refill_initial_sets_balance(active_tutor, db_session):
    db_session.add(
        TutorSubscriptionPlan(
            tutor_id=active_tutor.id,
            price_cents=1500,
            currency="eur",
            is_active=True,
            monthly_grading_credits=4,
            credits_roll_over=False,
        )
    )
    db_session.commit()
    student = _student(db_session, "credits@x.com")
    bal = grading_credits.refill_for_subscription(
        session=db_session,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        period_end=datetime.now(UTC) + timedelta(days=30),
        is_initial=True,
    )
    assert bal is not None
    assert bal.available == 4


def test_refill_rollover_adds_to_balance(active_tutor, db_session):
    db_session.add(
        TutorSubscriptionPlan(
            tutor_id=active_tutor.id,
            price_cents=1500,
            currency="eur",
            is_active=True,
            monthly_grading_credits=3,
            credits_roll_over=True,
        )
    )
    db_session.commit()
    student = _student(db_session, "rollover@x.com")
    db_session.add(
        StudentGradingCreditBalance(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            available=2,
        )
    )
    db_session.commit()
    bal = grading_credits.refill_for_subscription(
        session=db_session,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        period_end=datetime.now(UTC) + timedelta(days=30),
        is_initial=False,
    )
    assert bal.available == 5  # 2 banked + 3 new


def test_refill_no_rollover_resets_balance(active_tutor, db_session):
    db_session.add(
        TutorSubscriptionPlan(
            tutor_id=active_tutor.id,
            price_cents=1500,
            currency="eur",
            is_active=True,
            monthly_grading_credits=3,
            credits_roll_over=False,
        )
    )
    db_session.commit()
    student = _student(db_session, "reset@x.com")
    db_session.add(
        StudentGradingCreditBalance(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            available=2,
        )
    )
    db_session.commit()
    bal = grading_credits.refill_for_subscription(
        session=db_session,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        period_end=datetime.now(UTC) + timedelta(days=30),
        is_initial=False,
    )
    assert bal.available == 3  # reset, doesn't keep the 2


def test_refill_idempotent_on_same_period(active_tutor, db_session):
    db_session.add(
        TutorSubscriptionPlan(
            tutor_id=active_tutor.id,
            price_cents=1500,
            currency="eur",
            is_active=True,
            monthly_grading_credits=4,
            credits_roll_over=True,
        )
    )
    db_session.commit()
    student = _student(db_session, "idem@x.com")
    period_end = datetime.now(UTC) + timedelta(days=30)
    bal1 = grading_credits.refill_for_subscription(
        session=db_session,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        period_end=period_end,
        is_initial=True,
    )
    assert bal1.available == 4
    bal2 = grading_credits.refill_for_subscription(
        session=db_session,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        period_end=period_end,
        is_initial=False,
    )
    assert bal2.available == 4  # same period_end → no double-grant


# --- Spend credit endpoint ------------------------------------------


def test_spend_credit_marks_grading_paid(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "spend@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    db_session.add(
        StudentGradingCreditBalance(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            available=3,
        )
    )
    db_session.commit()
    r = client.post(
        f"/users/me/assignments/{a['id']}/use-grading-credit",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 200
    assert r.json()["submission_awaiting_payment"] is False
    # Balance decremented.
    bal = db_session.exec(
        StudentGradingCreditBalance.__table__.select().where(
            StudentGradingCreditBalance.__table__.c.student_user_id == student.id
        )
    ).first()
    assert bal.available == 2
    # Audit row written.
    payment = db_session.exec(
        HomeworkGradingPayment.__table__.select().where(
            HomeworkGradingPayment.__table__.c.student_user_id == student.id
        )
    ).first()
    assert payment.kind == "credit"


def test_spend_credit_409_when_no_balance(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "broke@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    r = client.post(
        f"/users/me/assignments/{a['id']}/use-grading-credit",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 409


def test_spend_credit_400_when_already_paid(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "already@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    # Mark submission as grading_paid manually.
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    sub = db_session.exec(
        HomeworkSubmission.__table__.select().where(
            HomeworkSubmission.__table__.c.assignment_id == a["id"]
        )
    ).first()
    real_sub = db_session.get(HomeworkSubmission, sub.id)
    real_sub.grading_paid = True
    db_session.add(real_sub)
    db_session.commit()
    r = client.post(
        f"/users/me/assignments/{a['id']}/use-grading-credit",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 400


# --- Stripe checkout for grading ------------------------------------


def test_grading_checkout_uses_destination_charge(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "stripe@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    r = client.post(
        f"/users/me/assignments/{a['id']}/grading-checkout",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 200
    call = stub_stripe[0]
    assert call["mode"] == "payment"
    assert call["line_items"][0]["price_data"]["unit_amount"] == 500
    # Free tier → 10% = 50 cents.
    assert call["payment_intent_data"]["application_fee_amount"] == 50
    assert call["metadata"]["type"] == "homework_grading"


def test_grading_checkout_fee_drops_for_pro(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    template = _setup_paid_template(active_tutor, db_session, grading_price=1000)
    student = _student(db_session, "stripe-pro@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    client.post(
        f"/users/me/assignments/{a['id']}/grading-checkout",
        headers=auth_headers_for(student),
    )
    assert stub_stripe[0]["payment_intent_data"]["application_fee_amount"] == 50


# --- Webhook: grading payment + subscription refill -----------------


def test_grading_webhook_flips_grading_paid(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "wh@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "x"}},
        headers=auth_headers_for(student),
    )
    sub = db_session.exec(
        HomeworkSubmission.__table__.select().where(
            HomeworkSubmission.__table__.c.assignment_id == a["id"]
        )
    ).first()
    from backend.routers.pledges import _handle_grading_checkout

    _handle_grading_checkout(
        db_session,
        {
            "id": "cs_grade_wh",
            "payment_intent": "pi_wh",
            "amount_total": 500,
            "metadata": {
                "type": "homework_grading",
                "submission_id": str(sub.id),
                "tutor_id": str(active_tutor.id),
                "student_user_id": str(student.id),
                "platform_fee_cents": "50",
            },
        },
    )
    db_session.expire_all()
    real_sub = db_session.get(HomeworkSubmission, sub.id)
    assert real_sub.grading_paid is True


def test_subscription_renewal_refills_credits(
    client, active_tutor, teacher_user, db_session
):
    db_session.add(
        TutorSubscriptionPlan(
            tutor_id=active_tutor.id,
            price_cents=1500,
            currency="eur",
            is_active=True,
            monthly_grading_credits=5,
            credits_roll_over=False,
        )
    )
    student = _student(db_session, "renew@x.com")
    previous = datetime.now(UTC) - timedelta(days=1)
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_renew",
            stripe_price_cents_snapshot=1500,
            current_period_end=previous,
        )
    )
    db_session.commit()
    from backend.routers.pledges import handle_subscription_event

    new_period = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    handle_subscription_event(
        db_session,
        {
            "id": "sub_renew",
            "status": "active",
            "current_period_end": new_period,
            "cancel_at_period_end": False,
        },
    )
    bal = db_session.exec(
        StudentGradingCreditBalance.__table__.select().where(
            StudentGradingCreditBalance.__table__.c.student_user_id == student.id
        )
    ).first()
    assert bal is not None
    assert bal.available == 5


# --- Tutor grades a paid submission normally ------------------------


def test_tutor_grades_paid_submission(
    client, active_tutor, teacher_user, db_session
):
    template = _setup_paid_template(active_tutor, db_session, grading_price=500)
    student = _student(db_session, "graded@x.com")
    a = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": template.id},
        headers=_h(teacher_user),
    ).json()
    client.post(
        f"/users/me/assignments/{a['id']}/submit",
        json={"answers": {"q1": "great"}},
        headers=auth_headers_for(student),
    )
    # Give them a credit + spend it so it's eligible for grading.
    db_session.add(
        StudentGradingCreditBalance(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            available=1,
        )
    )
    db_session.commit()
    client.post(
        f"/users/me/assignments/{a['id']}/use-grading-credit",
        headers=auth_headers_for(student),
    )
    listing = client.get("/tutor/homework/assignments", headers=_h(teacher_user))
    item = next(it for it in listing.json() if it["id"] == a["id"])
    assert item["submission_needs_review"] is True
    assert item["submission_awaiting_payment"] is False
    sub_id = item["submission_id"]
    r = client.post(
        f"/tutor/homework/submissions/{sub_id}/grade",
        json={"manual_score": 4, "feedback": "Good!"},
        headers=_h(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["submission_score"] == 4
