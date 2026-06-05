"""Kotobaseed API entry point.

Wires CORS, the startup seed, and includes every router. Per-environment
config (CORS origins, DB URL, secrets) is read via `config.settings`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from . import database as _database  # late-bound engine so tests can swap it
from .config import settings
from .database import create_db_and_tables
from .models import LanguageGroup, Project, User, UserRole
from .routers import (
    admin,
    auth,
    conversations,
    groups,
    notifications,
    onboarding,
    pledges,
    projects,
    ratings,
    requests,
    subscriptions,
    tutor_site,
    users,
    verifications,
    videos,
)
from .security import get_password_hash
from .tenancy import add_tenant_middleware

log = logging.getLogger(__name__)


def _seed_admin_user(session: Session) -> None:
    """Create the default admin from env vars if it doesn't already exist."""
    if not (settings.admin_email and settings.admin_password):
        log.info("ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin seed")
        return
    existing = session.exec(select(User).where(User.email == settings.admin_email)).first()
    if existing:
        log.info("Admin user %s already exists", settings.admin_email)
        return
    user = User(
        email=settings.admin_email,
        hashed_password=get_password_hash(settings.admin_password),
        full_name="System Admin",
        role=UserRole.ADMIN,
    )
    session.add(user)
    session.commit()
    log.info("Created default admin user %s", settings.admin_email)


def _sync_language_groups(session: Session) -> None:
    """Backfill LanguageGroup rows for any languages that have a project."""
    project_languages = set(session.exec(select(Project.language).distinct()).all())
    existing = set(session.exec(select(LanguageGroup.language_name)).all())
    for lang in project_languages - existing:
        session.add(LanguageGroup(language_name=lang))
        log.info("Created missing LanguageGroup for: %s", lang)
    session.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db_and_tables()
    with Session(_database.engine) as session:
        _seed_admin_user(session)
        _sync_language_groups(session)
    yield


app = FastAPI(title="Kotobaseed", lifespan=lifespan)

# Starlette wraps middleware LIFO: the LAST added is outermost. CORS goes
# last so it handles preflights before tenant resolution runs a DB query.
add_tenant_middleware(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    projects.router,
    pledges.router,
    videos.router,
    users.router,
    requests.router,
    notifications.router,
    ratings.router,
    admin.router,
    verifications.router,
    conversations.router,
    groups.router,
    subscriptions.router,
    tutor_site.router,
    onboarding.router,
):
    app.include_router(router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "service": "Kotobaseed API",
        "environment": settings.environment,
    }


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
