"""Auto-pause sweep for inactive Starter tutors."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session, select

from backend.config import settings
from backend.models import Tutor, TutorAccountStatus, TutorPlan, User
from backend.services.dormant_pause import find_dormant_tutors, pause_dormant_tutors


def _mk_tutor(
    db_session: Session,
    *,
    user: User,
    slug: str,
    plan: TutorPlan = TutorPlan.STARTER,
    status: TutorAccountStatus = TutorAccountStatus.ACTIVE,
    last_lesson_at: datetime | None = None,
    created_at: datetime | None = None,
) -> Tutor:
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=slug,
        display_name=slug.title(),
        plan=plan,
        account_status=status,
        last_completed_lesson_at=last_lesson_at,
        created_at=created_at or datetime.now(UTC),
    )
    db_session.add(tutor)
    db_session.commit()
    db_session.refresh(tutor)
    return tutor


@pytest.fixture
def active_starter_tutor_recent_lesson(db_session, teacher_user) -> Tutor:
    """A Starter tutor who taught yesterday — should NOT be paused."""
    return _mk_tutor(
        db_session,
        user=teacher_user,
        slug="active",
        last_lesson_at=datetime.now(UTC) - timedelta(days=1),
    )


def _make_extra_teacher(db_session, email, full_name):
    user = User(
        email=email,
        hashed_password="x",
        full_name=full_name,
        role=teacher_role(),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def teacher_role():
    from backend.models import UserRole
    return UserRole.TEACHER


# --- Tests --------------------------------------------------------------


def test_find_dormant_excludes_recently_active(db_session, active_starter_tutor_recent_lesson):
    assert find_dormant_tutors(db_session) == []


def test_find_dormant_includes_long_inactive(db_session, teacher_user):
    days = settings.dormant_pause_days + 1
    _mk_tutor(
        db_session,
        user=teacher_user,
        slug="dormant",
        last_lesson_at=datetime.now(UTC) - timedelta(days=days),
    )
    found = find_dormant_tutors(db_session)
    assert len(found) == 1
    assert found[0].tutor_slug == "dormant"


def test_find_dormant_includes_never_taught_old_account(db_session, teacher_user):
    """A tutor who never finished a lesson AND signed up >30 days ago is dormant."""
    days = settings.dormant_pause_days + 5
    _mk_tutor(
        db_session,
        user=teacher_user,
        slug="ghost",
        last_lesson_at=None,
        created_at=datetime.now(UTC) - timedelta(days=days),
    )
    found = find_dormant_tutors(db_session)
    assert [t.tutor_slug for t in found] == ["ghost"]


def test_find_dormant_skips_pro(db_session, teacher_user):
    """Pro tutors don't auto-pause (they're paying — different lifecycle)."""
    _mk_tutor(
        db_session,
        user=teacher_user,
        slug="propro",
        plan=TutorPlan.PRO,
        last_lesson_at=datetime.now(UTC) - timedelta(days=365),
    )
    assert find_dormant_tutors(db_session) == []


def test_find_dormant_skips_already_paused(db_session, teacher_user):
    _mk_tutor(
        db_session,
        user=teacher_user,
        slug="alreadypaused",
        status=TutorAccountStatus.PAUSED_DORMANT,
        last_lesson_at=datetime.now(UTC) - timedelta(days=90),
    )
    assert find_dormant_tutors(db_session) == []


def test_pause_dormant_flips_status_and_logs(db_session, teacher_user, monkeypatch):
    from backend import database as _database

    monkeypatch.setattr(_database, "engine", db_session.bind)

    days = settings.dormant_pause_days + 7
    tutor = _mk_tutor(
        db_session,
        user=teacher_user,
        slug="sleeper",
        last_lesson_at=datetime.now(UTC) - timedelta(days=days),
    )

    paused = pause_dormant_tutors()
    assert paused == 1

    db_session.refresh(tutor)
    assert tutor.account_status == TutorAccountStatus.PAUSED_DORMANT
    assert tutor.paused_reason and "days" in tutor.paused_reason

    # Audit trail
    from backend.models import AuditLog

    audit_rows = db_session.exec(
        select(AuditLog).where(AuditLog.action == "tutor.paused_dormant")
    ).all()
    assert len(audit_rows) == 1
    assert audit_rows[0].target_type == "tutor"
    assert audit_rows[0].target_id == tutor.id
    assert audit_rows[0].actor_label == "system:cron:dormant_pause"
