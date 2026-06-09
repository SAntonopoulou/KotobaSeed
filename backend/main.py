"""Kotobaseed API entry point.

Wires CORS, the startup seed, and includes every router. Per-environment
config (CORS origins, DB URL, secrets) is read via `config.settings`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from . import database as _database  # late-bound engine so tests can swap it
from .config import settings
from .database import create_db_and_tables
from .models import LanguageGroup, Project, User, UserRole
from .routers import (
    admin_db,
    admin_grants,
    admin,
    announcements,
    article_engagement,
    articles,
    cohorts,
    demo_entry,
    custom_themes,
    demo_trials,
    discover,
    auth,
    conversations,
    email_templates,
    group_sessions,
    groups,
    group_threads,
    homework,
    language_groups,
    maintenance,
    marketplace,
    modules,
    newsletters,
    notifications,
    onboarding,
    placement,
    platform,
    pledges,
    projects,
    ratings,
    recurring,
    referrals,
    reports,
    requests,
    transparency,
    subscriptions,
    support,
    testimonials,
    minute_packs,
    tutor_onboarding,
    tutor_pages,
    tutor_site,
    tutor_students,
    tutor_subscriptions,
    tutor_teams,
    tutor_verifications,
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


def _run_group_evaluation_sweep() -> None:
    """Hourly job — evaluate group sessions whose threshold has passed."""
    from .services import group_lessons

    with Session(_database.engine) as session:
        try:
            n = group_lessons.sweep_due_evaluations(session)
            if n:
                log.info("Group lesson sweep evaluated %d session(s).", n)
        except Exception:
            log.exception("Group lesson evaluation sweep failed")


def _run_db_backup() -> None:
    """Daily — snapshot SQLite + prune old backups."""
    from .services import db_backup

    db_backup.run_backup_and_prune()


def _run_referrals_sweep() -> None:
    """Daily — re-evaluate every referral attribution to catch newly-met
    milestones (e.g. cumulative tutor revenue crossing the next threshold)."""
    from .services import referrals as _referrals

    with Session(_database.engine) as session:
        try:
            n = _referrals.sweep_attributions(session)
            if n:
                log.info("Referral sweep granted %d new reward(s).", n)
        except Exception:
            log.exception("Referral sweep failed")


def _run_demo_janitor() -> None:
    """Daily wrapper around the demo account janitor. Opens its own
    session; logs errors so a single bad sweep doesn't kill the loop."""
    try:
        from .scripts.demo_janitor import run as _janitor_run
        result = _janitor_run()
        log.info("demo_janitor result: %s", result)
    except Exception:
        log.exception("demo_janitor failed")


def _run_admin_grants_sweep() -> None:
    """Daily — auto-expire time-gated admin comps + reverse side effects."""
    from .services import admin_grants as _ag

    with Session(_database.engine) as session:
        try:
            n = _ag.sweep_expired_grants(session)
            if n:
                log.info("Admin-grants sweep expired %d grant(s).", n)
        except Exception:
            log.exception("Admin grants sweep failed")


def _run_recurring_sweep() -> None:
    """Daily job — top up child Bookings for every active recurring plan,
    then cancel any PENDING_PAYMENT recurring bookings inside the 48h
    cutoff so the slots free up.
    """
    from .services import recurring_bookings

    with Session(_database.engine) as session:
        try:
            generated = recurring_bookings.sweep_active_plans(session)
            cancelled = recurring_bookings.sweep_expire_unpaid(session)
            if generated or cancelled:
                log.info(
                    "Recurring sweep: %d new booking(s), %d expired unpaid.",
                    generated,
                    cancelled,
                )
        except Exception:
            log.exception("Recurring booking sweep failed")


def _build_scheduler():
    """Return a started AsyncIOScheduler with the dormant-pause + booking-
    reminder jobs, or None if scheduling is disabled. Importing APScheduler
    lazily so test runs that don't exercise the scheduler don't pay the
    import cost.
    """
    if not settings.scheduler_enabled:
        log.info("scheduler_enabled=false; skipping APScheduler setup")
        return None
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    # Production runs against Postgres → use a SQLAlchemy jobstore so
    # next-run timestamps and misfire bookkeeping survive a restart and
    # are visible to any operations tooling that can read the DB.
    # Dev (sqlite) sticks with the in-memory store so test runs stay
    # hermetic — they replace_existing on every start anyway.
    is_postgres = settings.database_url.startswith("postgres")
    jobstores = {
        "default": SQLAlchemyJobStore(url=settings.database_url)
        if is_postgres
        else MemoryJobStore()
    }
    scheduler = AsyncIOScheduler(jobstores=jobstores)
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
    scheduler.add_job(
        _run_group_evaluation_sweep,
        trigger=CronTrigger(minute=10, timezone="UTC"),
        id="group_evaluations",
        replace_existing=True,
        misfire_grace_time=1800,
    )
    scheduler.add_job(
        _run_recurring_sweep,
        trigger=CronTrigger(hour=3, minute=15, timezone="UTC"),
        id="recurring_sweep",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_referrals_sweep,
        trigger=CronTrigger(hour=4, minute=30, timezone="UTC"),
        id="referrals_sweep",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_admin_grants_sweep,
        trigger=CronTrigger(hour=5, minute=0, timezone="UTC"),
        id="admin_grants_sweep",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_demo_janitor,
        trigger=CronTrigger(hour=4, minute=45, timezone="UTC"),
        id="demo_janitor",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_db_backup,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="db_backup",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    log.info(
        "Scheduler started — dormant_pause at %02d:00 UTC daily, booking reminders hourly at :05",
        settings.dormant_check_hour_utc,
    )
    return scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Auto-create-then-stamp pattern (documented in baseline migration):
    # SQLModel.metadata.create_all() is idempotent and bootstraps every
    # base table; alembic then owns incremental changes from baseline on.
    # Skipping this in prod breaks fresh Postgres deploys because the
    # baseline migration is a no-op stamp marker.
    create_db_and_tables()
    with Session(_database.engine) as session:
        _seed_admin_user(session)
        _sync_language_groups(session)
        from .services import achievements_seed as _achievements_seed

        _achievements_seed.seed(session)
    scheduler = _build_scheduler()
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)


# Optional Sentry — initialised here at module import so unhandled
# exceptions are captured even before lifespan finishes. SENTRY_DSN env
# absent = no-op import; SDK only sends if the DSN resolves.
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Profile a portion of traces so we see slow endpoints in detail.
        profiles_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.environment,
        # Tag every event with the release the SHA we're running so
        # post-deploy regressions are obvious in the Sentry release
        # tracker. The CI workflow writes this file at build time.
        release=settings.sentry_release or None,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        send_default_pii=False,
        # PII scrubbing — strip auth headers + Stripe tokens before
        # events leave the box. Sentry has built-in scrubbing too but
        # this is the belt-and-suspenders pass.
        before_send=lambda event, _hint: _scrub_sentry_event(event),
    )
    log.info("Sentry initialised (env=%s, release=%s)", settings.environment, settings.sentry_release)


def _scrub_sentry_event(event: dict) -> dict:
    """Redact secrets before they leave the box."""
    # Drop the Authorization header outright.
    req = event.get("request", {}) or {}
    headers = req.get("headers", {}) or {}
    for k in list(headers.keys()):
        if k.lower() in {"authorization", "cookie", "x-api-key"}:
            headers[k] = "[scrubbed]"
    # Trim out Stripe webhook signatures + similar.
    body = req.get("data", {})
    if isinstance(body, dict):
        for k in list(body.keys()):
            if "secret" in k.lower() or "password" in k.lower() or "token" in k.lower():
                body[k] = "[scrubbed]"
    return event


app = FastAPI(title="Kotobaseed", lifespan=lifespan)

# Rate limiter — applied to auth endpoints via a decorator. Storage is
# in-memory by default; for multi-worker deployments use Redis (see
# slowapi docs). Per-IP keys are enough for the auth-attack vector.
# E402: middleware must be wired after `app` is defined above.
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

from .limiter import limiter  # noqa: E402

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_exceeded_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        {"detail": "Too many requests. Slow down and try again in a moment."},
        status_code=429,
    )


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


# --- Local-volume uploads --------------------------------------------------
# When the storage facade is running in local mode (no R2 creds), files
# get written to ``settings.local_uploads_dir`` and served back out here.
# Caddy proxies /uploads/* to the backend the same way it does /api/*.
# Mount unconditionally so that switching backends later (R2 → local or
# vice-versa) keeps any legacy local URLs serveable until the next
# user re-upload.
import mimetypes as _mimetypes  # noqa: E402
import os as _os  # noqa: E402

# Python's stdlib mimetypes table doesn't include webp on some distros;
# without this StaticFiles serves uploaded avatars as
# `application/octet-stream` which kills both browser caching and
# rendering on some embeds.
_mimetypes.add_type("image/webp", ".webp")
_mimetypes.add_type("image/heic", ".heic")
_mimetypes.add_type("image/heif", ".heif")

_uploads_dir = settings.local_uploads_dir
try:
    _os.makedirs(_uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")
    log.info("Local uploads mounted at /uploads → %s", _uploads_dir)
except OSError:
    log.exception("Could not create uploads dir %s — /uploads disabled", _uploads_dir)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    """Liveness probe — used by docker healthcheck + uptime monitors."""
    return {"ok": True, "service": "kotobaseed"}


@app.get("/readyz", include_in_schema=False)
def readyz() -> dict:
    """Readiness probe — verifies DB is reachable before accepting traffic."""
    from sqlmodel import Session as _S, select as _sel

    with _S(_database.engine) as session:
        session.exec(_sel(1)).first()
    return {"ok": True}

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
    admin_db.router,
    admin_grants.router,
    custom_themes.router,
    discover.router,
    verifications.router,
    tutor_verifications.router,
    tutor_students.router,
    tutor_onboarding.router,
    tutor_teams.router,
    minute_packs.router,
    conversations.router,
    groups.router,
    language_groups.router,
    group_threads.router,
    article_engagement.router,
    cohorts.router,
    demo_entry.router,
    subscriptions.router,
    tutor_site.router,
    tutor_pages.router,
    onboarding.router,
    marketplace.router,
    articles.router,
    testimonials.router,
    email_templates.router,
    newsletters.router,
    homework.router,
    placement.router,
    modules.router,
    tutor_subscriptions.router,
    platform.router,
    support.router,
    support.staff_router,
    group_sessions.router,
    recurring.router,
    referrals.router,
    reports.router,
    reports.admin_router,
    announcements.router,
    announcements.admin_router,
    transparency.router,
    maintenance.router,
    demo_trials.router,
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
