"""Apex marketplace directory + listing toggle."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlmodel import Session

from backend.models import (
    LessonPack,
    Tutor,
    TutorAccountStatus,
    TutorPlan,
    User,
    UserRole,
)
from backend.security import get_password_hash

from .conftest import auth_headers_for


def _verified_user(
    db_session: Session, email: str, languages: str | None = None, full_name: str = "Test"
) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=full_name,
        role=UserRole.TUTOR,
        is_active=True,
        email_verified_at=datetime.now(UTC),
        languages=languages,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_listed_tutor(
    db_session: Session,
    user: User,
    slug: str,
    display_name: str,
    *,
    offers_free_trial: bool = False,
    free_trial_minutes: int = 20,
) -> Tutor:
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=slug,
        display_name=display_name,
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.ACTIVE,
        list_in_marketplace=True,
        offers_free_trial=offers_free_trial,
        free_trial_minutes=free_trial_minutes,
    )
    db_session.add(tutor)
    db_session.commit()
    db_session.refresh(tutor)
    return tutor


def _add_single_pack(
    db_session: Session, tutor: Tutor, *, price_cents: int = 2500, duration: int = 60
) -> LessonPack:
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Single lesson",
        num_lessons=1,
        duration_minutes=duration,
        price_cents=price_cents,
        currency="eur",
        is_default_single=True,
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


@pytest.fixture
def directory_with_three_tutors(db_session: Session):
    """Three Active+verified+listed tutors: cheap Greek with trial, mid Spanish
    no trial, expensive Japanese no trial. Plus one suppressed tutor (opt-out)."""
    u1 = _verified_user(db_session, "anna@example.com", languages="Greek, English")
    t1 = _make_listed_tutor(db_session, u1, "anna", "Anna", offers_free_trial=True, free_trial_minutes=20)
    _add_single_pack(db_session, t1, price_cents=2000, duration=60)

    u2 = _verified_user(db_session, "bea@example.com", languages="Spanish")
    t2 = _make_listed_tutor(db_session, u2, "bea", "Bea")
    _add_single_pack(db_session, t2, price_cents=3000, duration=60)

    u3 = _verified_user(db_session, "chika@example.com", languages="Japanese")
    t3 = _make_listed_tutor(db_session, u3, "chika", "Chika")
    _add_single_pack(db_session, t3, price_cents=5000, duration=60)

    # Opt-out tutor — should never appear.
    u4 = _verified_user(db_session, "diane@example.com", languages="Greek")
    t4 = _make_listed_tutor(db_session, u4, "diane", "Diane")
    t4.list_in_marketplace = False
    db_session.add(t4)
    db_session.commit()

    return [t1, t2, t3]


# --- Listing -----------------------------------------------------------


def test_list_returns_only_opted_in_active_verified(client, directory_with_three_tutors):
    r = client.get("/marketplace/tutors")
    assert r.status_code == 200
    body = r.json()
    slugs = [t["tutor_slug"] for t in body]
    assert set(slugs) == {"anna", "bea", "chika"}
    assert "diane" not in slugs  # opt-out


def test_list_skips_paused_kyc_tutors(client, directory_with_three_tutors, db_session):
    tutor = db_session.exec(Tutor.__table__.select().where(Tutor.tutor_slug == "bea")).first()
    bea = db_session.get(Tutor, tutor.id)
    bea.account_status = TutorAccountStatus.PAUSED_KYC
    db_session.add(bea)
    db_session.commit()
    r = client.get("/marketplace/tutors")
    slugs = [t["tutor_slug"] for t in r.json()]
    assert "bea" not in slugs


def test_list_skips_unverified_users(client, directory_with_three_tutors, db_session):
    user = db_session.exec(User.__table__.select().where(User.email == "anna@example.com")).first()
    anna = db_session.get(User, user.id)
    anna.email_verified_at = None
    db_session.add(anna)
    db_session.commit()
    r = client.get("/marketplace/tutors")
    slugs = [t["tutor_slug"] for t in r.json()]
    assert "anna" not in slugs


def test_list_sorts_trial_offerers_first(client, directory_with_three_tutors):
    """Trial-offering tutors lead the list to maximize student conversion."""
    body = client.get("/marketplace/tutors").json()
    # Anna is the only trial offerer — must come first.
    assert body[0]["tutor_slug"] == "anna"


def test_card_includes_single_lesson_price(client, directory_with_three_tutors):
    body = client.get("/marketplace/tutors").json()
    anna = next(t for t in body if t["tutor_slug"] == "anna")
    assert anna["single_lesson_price_cents"] == 2000
    assert anna["single_lesson_duration_minutes"] == 60
    assert anna["single_lesson_currency"] == "eur"
    assert anna["offers_free_trial"] is True
    assert anna["free_trial_minutes"] == 20
    assert anna["site_url"].endswith("anna.localhost:5173")


def test_card_handles_tutor_without_single_lesson(client, db_session):
    user = _verified_user(db_session, "eda@example.com", languages="Korean")
    _make_listed_tutor(db_session, user, "eda", "Eda")
    body = client.get("/marketplace/tutors").json()
    eda = next(t for t in body if t["tutor_slug"] == "eda")
    assert eda["single_lesson_price_cents"] is None
    assert eda["single_lesson_duration_minutes"] is None


# --- Filters ------------------------------------------------------------


def test_filter_by_language_case_insensitive_substring(client, directory_with_three_tutors):
    body = client.get("/marketplace/tutors?language=greek").json()
    slugs = [t["tutor_slug"] for t in body]
    assert "anna" in slugs
    assert "chika" not in slugs


def test_filter_by_max_price(client, directory_with_three_tutors):
    body = client.get("/marketplace/tutors?max_price_cents=3000").json()
    slugs = [t["tutor_slug"] for t in body]
    # 2000 (anna) and 3000 (bea) pass; 5000 (chika) is excluded.
    assert set(slugs) == {"anna", "bea"}


def test_filter_trial_only(client, directory_with_three_tutors):
    body = client.get("/marketplace/tutors?trial_only=true").json()
    slugs = [t["tutor_slug"] for t in body]
    assert slugs == ["anna"]


def test_filters_compose(client, directory_with_three_tutors, db_session):
    """Greek + trial-only → still just Anna."""
    body = client.get("/marketplace/tutors?language=greek&trial_only=true").json()
    assert [t["tutor_slug"] for t in body] == ["anna"]


# --- Languages ---------------------------------------------------------


def test_languages_dedup_case_insensitive(client, directory_with_three_tutors, db_session):
    user = _verified_user(db_session, "eva@example.com", languages="greek; PORTUGUESE")
    _make_listed_tutor(db_session, user, "eva", "Eva")
    body = client.get("/marketplace/languages").json()
    # Each language appears once, regardless of casing in source data.
    lowered = [s.lower() for s in body]
    assert lowered.count("greek") == 1
    assert lowered.count("portuguese") == 1
    assert "spanish" in lowered
    assert "japanese" in lowered


def test_languages_excludes_unlisted_tutors(client, db_session):
    """A tutor opted out of marketplace shouldn't contribute their languages."""
    u = _verified_user(db_session, "f@example.com", languages="Swahili")
    t = _make_listed_tutor(db_session, u, "f", "F")
    t.list_in_marketplace = False
    db_session.add(t)
    db_session.commit()
    body = client.get("/marketplace/languages").json()
    assert "swahili" not in [s.lower() for s in body]


# --- Dashboard toggle --------------------------------------------------


def test_patch_tutor_me_toggles_listing(client, vasso_tutor, teacher_user, db_session):
    # Default on — toggle off via PATCH /tutor/me.
    r = client.patch(
        "/tutor/me",
        json={"list_in_marketplace": False},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["list_in_marketplace"] is False
    db_session.refresh(vasso_tutor)
    assert vasso_tutor.list_in_marketplace is False
