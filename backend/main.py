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
from .services.dormant_pause import pause_dormant_tutors
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


def _run_reminder_sweep() -> None:
    """Hourly job wrapper — opens its own session so APScheduler doesn't
    keep one alive across the whole process lifetime."""
    from .services import booking_emails

    with Session(_database.engine) as session:
        try:
            n = booking_emails.sweep_due_reminders(session)
            if n:
                log.info("Booking reminder sweep sent %d reminder(s).", n)
        except Exception:
            log.exception("Booking reminder sweep failed")


def _build_scheduler():
    """Return a started AsyncIOScheduler with the dormant-pause + booking-
    reminder jobs, or None if scheduling is disabled. Importing APScheduler
    lazily so test runs that don't exercise the scheduler don't pay the
    import cost.
    """
    if not settings.scheduler_enabled:
        log.info("scheduler_enabled=false; skipping APScheduler setup")
        return None
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        pause_dormant_tutors,
        trigger=CronTrigger(hour=settings.dormant_check_hour_utc, minute=0, timezone="UTC"),
        id="dormant_pause",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_reminder_sweep,
        trigger=CronTrigger(minute=5, timezone="UTC"),
        id="booking_reminders",
        replace_existing=True,
        misfire_grace_time=1800,
    )
    scheduler.start()
    log.info(
        "Scheduler started — dormant_pause at %02d:00 UTC daily, booking reminders hourly at :05",
        settings.dormant_check_hour_utc,
    )
    return scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db_and_tables()
    with Session(_database.engine) as session:
        _seed_admin_user(session)
        _sync_language_groups(session)
    scheduler = _build_scheduler()
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)


app = FastAPI(title="Kotobaseed", lifespan=lifespan)

# Starlette wraps middleware LIFO: the LAST added is outermost. CORS goes
# last so it handles preflights before tenant resolution runs a DB query.
add_tenant_middleware(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
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
