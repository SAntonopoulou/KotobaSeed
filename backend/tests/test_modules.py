"""Lesson modules + premium homework CRUD, checkout, webhook handling."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.models import (
    Article,
    HomeworkPurchase,
    HomeworkTemplate,
    LessonModule,
    ModulePurchase,
    SubscriptionTier,
    TutorAccountStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash
from backend.services.platform_fees import content_platform_fee

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _h(user):
    return {"Host": HOST, **auth_headers_for(user)}


def _student(db_session, email="buyer@example.com"):
    u = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=email.split("@")[0].title(),
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
    """Replace stripe.checkout.Session.create with a stub that returns a
    fake session object with a deterministic URL + id."""
    sessions: list[dict] = []

    def fake_create(**kwargs):
        sessions.append(kwargs)
        # Honour the api_key kwarg for shape only.
        kwargs.pop("api_key", None)

        class _S:
            url = "https://stripe.test/checkout/sess_test"
            id = f"cs_test_{len(sessions)}"

        return _S()

    import backend.routers.modules as mod

    monkeypatch.setattr(mod.stripe.checkout.Session, "create", fake_create)
    return sessions


# --- Platform fee math --------------------------------------------------


def test_content_fee_free_is_10_percent(db_session):
    u = User(
        email="free@x.com",
        hashed_password="x",
        full_name="F",
        role=UserRole.TUTOR,
        subscription_tier=SubscriptionTier.FREE,
    )
    assert content_platform_fee(u, 10_00) == 100  # €10 → €1


def test_content_fee_plus_is_7_percent(db_session):
    u = User(
        email="p@x.com",
        hashed_password="x",
        full_name="P",
        role=UserRole.TUTOR,
        subscription_tier=SubscriptionTier.PLUS,
    )
    assert content_platform_fee(u, 10_00) == 70


def test_content_fee_pro_is_5_percent(db_session):
    u = User(
        email="pr@x.com",
        hashed_password="x",
        full_name="P",
        role=UserRole.TUTOR,
        subscription_tier=SubscriptionTier.PRO,
    )
    assert content_platform_fee(u, 10_00) == 50


def test_content_fee_business_is_0(db_session):
    u = User(
        email="b@x.com",
        hashed_password="x",
        full_name="B",
        role=UserRole.TUTOR,
        subscription_tier=SubscriptionTier.BUSINESS,
    )
    assert content_platform_fee(u, 10_00) == 0


# --- Modules: CRUD ------------------------------------------------------


def test_create_module_owner_only(client, active_tutor, student_user):
    r = client.post(
        "/tutor/modules",
        json={"title": "Greek basics", "price_cents": 1000},
        headers=_h(student_user),
    )
    assert r.status_code == 403


def test_create_module_auto_slugs(client, active_tutor, teacher_user):
    r = client.post(
        "/tutor/modules",
        json={"title": "Greek for Beginners!", "price_cents": 2000},
        headers=_h(teacher_user),
    )
    assert r.status_code == 201
    assert r.json()["slug"] == "greek-for-beginners"


def test_create_module_validates_referenced_articles(
    client, active_tutor, teacher_user, db_session
):
    # Pretend article 9999 doesn't belong to this tutor.
    r = client.post(
        "/tutor/modules",
        json={
            "title": "Bad refs",
            "items": [{"kind": "article", "ref_id": 9999}],
        },
        headers=_h(teacher_user),
    )
    assert r.status_code == 400


def test_create_module_with_real_items(
    client, active_tutor, teacher_user, db_session
):
    article = Article(
        tutor_id=active_tutor.id, slug="intro", title="Intro", body_markdown=""
    )
    db_session.add(article)
    db_session.commit()
    db_session.refresh(article)
    template = HomeworkTemplate(
        tutor_id=active_tutor.id, title="Drill", questions_json="[]"
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    r = client.post(
        "/tutor/modules",
        json={
            "title": "Module 1",
            "price_cents": 2500,
            "items": [
                {"kind": "article", "ref_id": article.id},
                {"kind": "homework", "ref_id": template.id},
            ],
        },
        headers=_h(teacher_user),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["item_count"] == 2


def test_public_listing_hides_drafts(
    client, active_tutor, teacher_user, db_session
):
    client.post(
        "/tutor/modules",
        json={"title": "Draft", "price_cents": 1000},
        headers=_h(teacher_user),
    )
    client.post(
        "/tutor/modules",
        json={"title": "Live", "price_cents": 1000, "is_published": True},
        headers=_h(teacher_user),
    )
    r = client.get("/modules", headers={"Host": HOST})
    titles = [m["title"] for m in r.json()]
    assert "Live" in titles
    assert "Draft" not in titles


def test_public_detail_includes_purchased_false_for_anon(
    client, active_tutor, teacher_user
):
    client.post(
        "/tutor/modules",
        json={"title": "Open", "price_cents": 1000, "is_published": True},
        headers=_h(teacher_user),
    )
    r = client.get("/modules/open", headers={"Host": HOST})
    assert r.status_code == 200
    assert r.json()["purchased"] is False


# --- Checkout -----------------------------------------------------------


def test_module_checkout_creates_session(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    created = client.post(
        "/tutor/modules",
        json={"title": "Greek 101", "price_cents": 4000, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session)
    r = client.post(
        f"/tutor/modules/{mid}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200
    assert "stripe.test" in r.json()["checkout_url"]
    # Stripe call body inspection.
    assert len(stub_stripe) == 1
    call = stub_stripe[0]
    assert call["mode"] == "payment"
    assert call["line_items"][0]["price_data"]["unit_amount"] == 4000
    # Free tutor → 10% fee = 400 cents
    assert call["payment_intent_data"]["application_fee_amount"] == 400
    assert call["payment_intent_data"]["transfer_data"]["destination"] == "acct_test"
    assert call["metadata"]["type"] == "module"


def test_module_checkout_pro_pays_5_percent(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    teacher_user.subscription_tier = SubscriptionTier.PRO
    db_session.add(teacher_user)
    db_session.commit()
    created = client.post(
        "/tutor/modules",
        json={"title": "Pro module", "price_cents": 10_00, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session)
    client.post(
        f"/tutor/modules/{mid}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert stub_stripe[0]["payment_intent_data"]["application_fee_amount"] == 50


def test_module_checkout_business_pays_zero(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    teacher_user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(teacher_user)
    db_session.commit()
    created = client.post(
        "/tutor/modules",
        json={"title": "School", "price_cents": 10_00, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session, "biz@x.com")
    client.post(
        f"/tutor/modules/{mid}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert stub_stripe[0]["payment_intent_data"]["application_fee_amount"] == 0


def test_module_checkout_rejects_existing_purchase(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    created = client.post(
        "/tutor/modules",
        json={"title": "Once", "price_cents": 1000, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session, "owner@x.com")
    db_session.add(
        ModulePurchase(
            module_id=mid,
            tutor_id=active_tutor.id,
            student_user_id=student.id,
            amount_cents=1000,
        )
    )
    db_session.commit()
    r = client.post(
        f"/tutor/modules/{mid}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 409


# --- Webhook delivery --------------------------------------------------


def test_module_webhook_creates_purchase(
    client, active_tutor, teacher_user, db_session
):
    created = client.post(
        "/tutor/modules",
        json={"title": "Webhook test", "price_cents": 5000, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session, "webhook@x.com")
    from backend.routers.pledges import _handle_module_checkout

    _handle_module_checkout(
        db_session,
        {
            "id": "cs_test_x",
            "payment_intent": "pi_test_x",
            "amount_total": 5000,
            "metadata": {
                "type": "module",
                "module_id": str(mid),
                "tutor_id": str(active_tutor.id),
                "student_user_id": str(student.id),
                "platform_fee_cents": "500",
            },
        },
    )
    purchases = db_session.exec(
        ModulePurchase.__table__.select().where(
            ModulePurchase.__table__.c.module_id == mid
        )
    ).all()
    assert len(purchases) == 1


def test_module_webhook_is_idempotent(
    client, active_tutor, teacher_user, db_session
):
    created = client.post(
        "/tutor/modules",
        json={"title": "Idempotent", "price_cents": 1000, "is_published": True},
        headers=_h(teacher_user),
    )
    mid = created.json()["id"]
    student = _student(db_session, "id@x.com")
    from backend.routers.pledges import _handle_module_checkout

    metadata = {
        "type": "module",
        "module_id": str(mid),
        "tutor_id": str(active_tutor.id),
        "student_user_id": str(student.id),
        "platform_fee_cents": "100",
    }
    for _ in range(3):
        _handle_module_checkout(
            db_session,
            {"id": "cs_dup", "payment_intent": "pi_dup", "amount_total": 1000, "metadata": metadata},
        )
    rows = db_session.exec(
        ModulePurchase.__table__.select().where(
            ModulePurchase.__table__.c.module_id == mid
        )
    ).all()
    assert len(rows) == 1


# --- Premium homework --------------------------------------------------


def test_premium_homework_checkout(
    client, active_tutor, teacher_user, db_session, stub_stripe
):
    template = HomeworkTemplate(
        tutor_id=active_tutor.id,
        title="Premium drill",
        questions_json="[]",
        is_premium=True,
        price_cents=1500,
        is_active=True,
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    student = _student(db_session, "premhw@x.com")
    r = client.post(
        f"/tutor/homework/templates/{template.id}/checkout",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200
    assert stub_stripe[0]["metadata"]["type"] == "homework"
    # Free tier → 10% fee.
    assert stub_stripe[0]["payment_intent_data"]["application_fee_amount"] == 150


def test_premium_homework_webhook_creates_purchase_and_assignment(
    client, active_tutor, teacher_user, db_session
):
    template = HomeworkTemplate(
        tutor_id=active_tutor.id,
        title="Webhooked premium",
        questions_json="[]",
        is_premium=True,
        price_cents=1500,
        is_active=True,
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    student = _student(db_session, "hw-webhook@x.com")
    from backend.models import HomeworkAssignment
    from backend.routers.pledges import _handle_premium_homework_checkout

    _handle_premium_homework_checkout(
        db_session,
        {
            "id": "cs_hw",
            "payment_intent": "pi_hw",
            "amount_total": 1500,
            "metadata": {
                "type": "homework",
                "template_id": str(template.id),
                "tutor_id": str(active_tutor.id),
                "student_user_id": str(student.id),
                "platform_fee_cents": "150",
            },
        },
    )
    purchase = db_session.exec(
        HomeworkPurchase.__table__.select().where(
            HomeworkPurchase.__table__.c.template_id == template.id
        )
    ).first()
    assert purchase is not None
    assignment = db_session.exec(
        HomeworkAssignment.__table__.select().where(
            HomeworkAssignment.__table__.c.template_id == template.id
        )
    ).first()
    assert assignment is not None


# --- Student: my purchases --------------------------------------------


def test_my_modules_lists_purchased(client, active_tutor, teacher_user, db_session):
    module = LessonModule(
        tutor_id=active_tutor.id,
        slug="m1",
        title="M1",
        items_json="[]",
        price_cents=500,
        is_published=True,
        published_at=datetime.now(UTC),
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
            amount_cents=500,
        )
    )
    db_session.commit()
    r = client.get(
        "/users/me/modules", headers=auth_headers_for(student)
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["title"] == "M1"
