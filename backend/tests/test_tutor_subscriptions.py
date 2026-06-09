"""Tutor content subscriptions: plan CRUD, checkout, webhook lifecycle,
access check unification with one-time purchases."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from backend.models import (
    HomeworkTemplate,
    LessonModule,
    ModulePurchase,
    StudentTutorSubscription,
    SubscriptionTier,
    TutorAccountStatus,
    TutorSubscriptionStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash
from backend.services import content_access

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _h(u):
    return {"Host": HOST, **auth_headers_for(u)}


def _student(db_session, email="sub@x.com"):
    u = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name="S",
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
    modifies: list[dict] = []

    def fake_create(**kwargs):
        sessions.append(kwargs)
        kwargs.pop("api_key", None)

        class _S:
            url = "https://stripe.test/sub_checkout"
            id = f"cs_sub_{len(sessions)}"

        return _S()

    def fake_modify(sid, **kwargs):
        modifies.append({"id": sid, **kwargs})
        class _S:
            id = sid
            cancel_at_period_end = kwargs.get("cancel_at_period_end")

        return _S()

    import backend.routers.tutor_subscriptions as tsub

    monkeypatch.setattr(tsub.stripe.checkout.Session, "create", fake_create)
    monkeypatch.setattr(tsub.stripe.Subscription, "modify", fake_modify)
    return {"sessions": sessions, "modifies": modifies}


# --- Plan CRUD ---------------------------------------------------------


def test_plan_owner_only(client, active_tutor, student_user):
    r = client.get("/tutor/subscription-plan", headers=_h(student_user))
    assert r.status_code == 403


def test_plan_upsert_lifecycle(client, active_tutor, teacher_user):
    r = client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["price_cents"] == 1500
    assert r.json()["fee_percent"] == 10.0  # Free tier default
    # Update price
    r2 = client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 2000},
        headers=_h(teacher_user),
    )
    assert r2.json()["price_cents"] == 2000


def test_plan_public_hidden_when_inactive(client, active_tutor, teacher_user):
    r = client.get(
        "/tutor/subscription-plan/public", headers={"Host": HOST}
    )
    assert r.json()["is_available"] is False


def test_plan_public_visible_when_active(client, active_tutor, teacher_user):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500, "is_active": True},
        headers=_h(teacher_user),
    )
    r = client.get(
        "/tutor/subscription-plan/public", headers={"Host": HOST}
    )
    body = r.json()
    assert body["is_available"] is True
    assert body["price_cents"] == 1500


def test_plan_deactivate(client, active_tutor, teacher_user):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    r = client.delete("/tutor/subscription-plan", headers=_h(teacher_user))
    assert r.status_code == 204
    public = client.get(
        "/tutor/subscription-plan/public", headers={"Host": HOST}
    )
    assert public.json()["is_available"] is False


# --- Checkout ---------------------------------------------------------


def test_subscribe_checkout_calls_stripe_with_destination_charges(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    student = _student(db_session)
    r = client.post(
        "/tutor/subscription-plan/subscribe",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200
    call = stub_stripe["sessions"][0]
    assert call["mode"] == "subscription"
    # Inline price_data with monthly recurring.
    li = call["line_items"][0]
    assert li["price_data"]["unit_amount"] == 1500
    assert li["price_data"]["recurring"]["interval"] == "month"
    # Destination charges + application_fee_percent.
    sd = call["subscription_data"]
    assert sd["application_fee_percent"] == 10.0  # Free tier
    assert sd["transfer_data"]["destination"] == "acct_test"
    assert sd["metadata"]["type"] == "tutor_subscription"


def test_subscribe_fee_percent_drops_for_pro_tutor(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 2000},
        headers=_h(teacher_user),
    )
    student = _student(db_session, "pro-buyer@x.com")
    client.post(
        "/tutor/subscription-plan/subscribe",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert stub_stripe["sessions"][0]["subscription_data"]["application_fee_percent"] == 5.0


def test_subscribe_fee_percent_zero_for_business(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    teacher_user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(teacher_user)
    db_session.commit()
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 5000},
        headers=_h(teacher_user),
    )
    student = _student(db_session, "biz-buyer@x.com")
    client.post(
        "/tutor/subscription-plan/subscribe",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert stub_stripe["sessions"][0]["subscription_data"]["application_fee_percent"] == 0.0


def test_subscribe_blocked_when_already_active(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    student = _student(db_session, "already@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_existing",
            current_period_end=datetime.now(UTC) + timedelta(days=30),
            stripe_price_cents_snapshot=1500,
        )
    )
    db_session.commit()
    r = client.post(
        "/tutor/subscription-plan/subscribe",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 409


def test_subscribe_404_when_no_plan(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    student = _student(db_session, "no-plan@x.com")
    r = client.post(
        "/tutor/subscription-plan/subscribe",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 404


# --- Webhook handlers ----------------------------------------------


def test_webhook_creates_subscription_from_checkout(
    client, active_tutor, teacher_user, db_session
):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    student = _student(db_session, "webhook@x.com")
    from backend.routers.pledges import _handle_tutor_subscription_checkout

    handled = _handle_tutor_subscription_checkout(
        db_session,
        {
            "id": "cs_webhook",
            "mode": "subscription",
            "subscription": "sub_test_1",
            "customer": "cus_test",
            "metadata": {
                "type": "tutor_subscription",
                "tutor_id": str(active_tutor.id),
                "student_user_id": str(student.id),
            },
        },
    )
    assert handled is True
    row = db_session.exec(
        StudentTutorSubscription.__table__.select().where(
            StudentTutorSubscription.__table__.c.student_user_id == student.id
        )
    ).first()
    assert row is not None


def test_webhook_subscription_updated_refreshes_status(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "renew@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_renew",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) - timedelta(days=1),  # expired
        )
    )
    db_session.commit()
    from backend.routers.pledges import handle_subscription_event

    future_ts = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    handled = handle_subscription_event(
        db_session,
        {
            "id": "sub_renew",
            "status": "active",
            "current_period_end": future_ts,
            "cancel_at_period_end": False,
        },
    )
    assert handled is True
    refreshed = db_session.exec(
        StudentTutorSubscription.__table__.select().where(
            StudentTutorSubscription.__table__.c.stripe_subscription_id == "sub_renew"
        )
    ).first()
    assert refreshed.status == TutorSubscriptionStatus.ACTIVE.value
    assert refreshed.current_period_end is not None


def test_webhook_subscription_deleted_marks_cancelled(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "cancel@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_cancel",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=10),
        )
    )
    db_session.commit()
    from backend.routers.pledges import handle_subscription_event

    handled = handle_subscription_event(
        db_session,
        {
            "id": "sub_cancel",
            "status": "canceled",
            "current_period_end": int((datetime.now(UTC) + timedelta(days=10)).timestamp()),
            "cancel_at_period_end": False,
            "canceled_at": int(datetime.now(UTC).timestamp()),
        },
    )
    assert handled is True
    row = db_session.exec(
        StudentTutorSubscription.__table__.select().where(
            StudentTutorSubscription.__table__.c.stripe_subscription_id == "sub_cancel"
        )
    ).first()
    assert row.status == TutorSubscriptionStatus.CANCELLED.value
    assert row.cancelled_at is not None


# --- Access check unification -------------------------------------


def test_access_via_individual_purchase(active_tutor, db_session):
    module = LessonModule(
        tutor_id=active_tutor.id, slug="m", title="M", items_json="[]", is_published=True
    )
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    student = _student(db_session, "owns@x.com")
    db_session.add(
        ModulePurchase(
            module_id=module.id,
            tutor_id=active_tutor.id,
            student_user_id=student.id,
        )
    )
    db_session.commit()
    assert content_access.has_module_access(
        db_session,
        module_id=module.id,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
    )


@pytest.mark.skip(reason="Per-tutor StudentTutorSubscription model retired in favour of platform Plus tier — see project_piecemeal_articles_shipped.md memory; content_access.has_module_access now keys off User.subscription_tier only")
def test_access_via_active_subscription(active_tutor, db_session):
    module = LessonModule(
        tutor_id=active_tutor.id, slug="ms", title="MS", items_json="[]", is_published=True
    )
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    student = _student(db_session, "subs@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_active",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=20),
        )
    )
    db_session.commit()
    assert content_access.has_module_access(
        db_session,
        module_id=module.id,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
    )


def test_expired_subscription_does_not_grant_access(active_tutor, db_session):
    module = LessonModule(
        tutor_id=active_tutor.id, slug="me", title="ME", items_json="[]", is_published=True
    )
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    student = _student(db_session, "expired@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_expired",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) - timedelta(days=1),
        )
    )
    db_session.commit()
    assert not content_access.has_module_access(
        db_session,
        module_id=module.id,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
    )


@pytest.mark.skip(reason="Per-tutor StudentTutorSubscription model retired (see project_piecemeal_articles_shipped.md)")
def test_past_due_still_grants_access(active_tutor, db_session):
    """PAST_DUE counts as active so a slow renewal doesn't lock students out."""
    module = LessonModule(
        tutor_id=active_tutor.id, slug="mp", title="MP", items_json="[]", is_published=True
    )
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    student = _student(db_session, "past@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.PAST_DUE,
            stripe_subscription_id="sub_pastdue",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=2),
        )
    )
    db_session.commit()
    assert content_access.has_module_access(
        db_session,
        module_id=module.id,
        tutor_id=active_tutor.id,
        student_user_id=student.id,
    )


# --- Block double-purchase when already subscribed ----------------


@pytest.mark.skip(reason="Per-tutor StudentTutorSubscription model retired (see project_piecemeal_articles_shipped.md)")
def test_module_checkout_blocked_if_subscribed(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    client.put(
        "/tutor/subscription-plan",
        json={"price_cents": 1500},
        headers=_h(teacher_user),
    )
    created = client.post(
        "/tutor/modules",
        json={"title": "Mod", "price_cents": 4000, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session, "subsb@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_block",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=20),
        )
    )
    db_session.commit()
    r = client.post(
        f"/tutor/modules/{mid}/checkout",
        json={"waive_withdrawal": True},
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 409


@pytest.mark.skip(reason="Per-tutor StudentTutorSubscription model retired (see project_piecemeal_articles_shipped.md)")
def test_premium_homework_checkout_blocked_if_subscribed(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    template = HomeworkTemplate(
        tutor_id=active_tutor.id,
        title="Premium",
        questions_json="[]",
        is_premium=True,
        price_cents=1500,
        is_active=True,
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    student = _student(db_session, "hwsubs@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_hw",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=20),
        )
    )
    db_session.commit()
    r = client.post(
        f"/tutor/homework/templates/{template.id}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 409


# --- Student: my subscriptions ------------------------------------


def test_list_my_subscriptions(client, active_tutor, db_session):
    student = _student(db_session, "mine@x.com")
    db_session.add(
        StudentTutorSubscription(
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_mine",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=10),
        )
    )
    db_session.commit()
    r = client.get(
        "/users/me/subscriptions/tutors", headers=auth_headers_for(student)
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["price_cents"] == 1500


def test_cancel_my_subscription_calls_stripe_and_marks_local(
    client, active_tutor, db_session, stub_stripe
):
    student = _student(db_session, "cancelme@x.com")
    sub = StudentTutorSubscription(
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        status=TutorSubscriptionStatus.ACTIVE,
        stripe_subscription_id="sub_cancelme",
        stripe_price_cents_snapshot=1500,
        current_period_end=datetime.now(UTC) + timedelta(days=10),
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    r = client.post(
        f"/users/me/subscriptions/tutors/{sub.id}/cancel",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 200
    assert r.json()["cancel_at_period_end"] is True
    assert stub_stripe["modifies"][0]["id"] == "sub_cancelme"
    assert stub_stripe["modifies"][0]["cancel_at_period_end"] is True
