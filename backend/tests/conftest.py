"""Shared pytest fixtures.

Uses an in-memory SQLite database per test session so tests are hermetic
and fast. Each test gets a fresh `Session` via `db_session`.

A `client` fixture wires the FastAPI TestClient against the test DB by
overriding `get_session`. Use `auth_client` / `auth_teacher_client` when
you need an authenticated request.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

# Set required env vars BEFORE importing anything from the app, so
# config.settings doesn't crash on missing fields.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SCHEDULER_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.database import get_session
from backend.main import app
from backend.models import Tutor, TutorAccountStatus, TutorPlan, User, UserRole
from backend.security import create_access_token, get_password_hash


@pytest.fixture(name="engine")
def engine_fixture():
    """One in-memory SQLite engine per test, shared across connections."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        # StaticPool ensures every connection sees the same in-memory DB
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(name="db_session")
def db_session_fixture(engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(engine, monkeypatch) -> Iterator[TestClient]:
    """FastAPI TestClient wired to the test engine.

    Replaces both the `get_session` dependency (used by route handlers) AND
    `backend.database.engine` (used by middleware that runs outside the
    dependency graph — e.g. tenant resolution).
    """

    def _get_session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    monkeypatch.setattr("backend.database.engine", engine)
    app.dependency_overrides[get_session] = _get_session_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ----- Factory helpers for users + auth ---------------------------------


def _make_user(
    db_session: Session,
    *,
    email: str,
    role: UserRole = UserRole.STUDENT,
    full_name: str | None = None,
    password: str = "password123",
) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        full_name=full_name or email.split("@")[0].title(),
        role=role,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def student_user(db_session: Session) -> User:
    return _make_user(db_session, email="student@example.com", role=UserRole.STUDENT)


@pytest.fixture
def teacher_user(db_session: Session) -> User:
    return _make_user(db_session, email="teacher@example.com", role=UserRole.TEACHER)


@pytest.fixture
def admin_user(db_session: Session) -> User:
    return _make_user(db_session, email="admin@example.com", role=UserRole.ADMIN)


def auth_headers_for(user: User) -> dict[str, str]:
    token = create_access_token(subject=user.id)
    return {"Authorization": f"Bearer {token}"}


# ----- Tenant fixtures --------------------------------------------------


def make_tutor(
    db_session: Session,
    *,
    user: User,
    slug: str = "vasso",
    display_name: str = "Vasso",
    custom_domain: str | None = None,
) -> Tutor:
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=slug,
        display_name=display_name,
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.ACTIVE,
        custom_domain=custom_domain,
    )
    db_session.add(tutor)
    db_session.commit()
    db_session.refresh(tutor)
    return tutor


@pytest.fixture
def vasso_tutor(db_session: Session, teacher_user: User) -> Tutor:
    return make_tutor(
        db_session,
        user=teacher_user,
        slug="vasso",
        display_name="Vasso",
        custom_domain="greekwithvasso.com",
    )
