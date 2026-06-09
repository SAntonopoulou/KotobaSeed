"""Demo account janitor — daily sweep that prunes unconverted demo
accounts older than the retention window.

A demo account is considered prunable if:
  * is_demo_account = True
  * demo_workspace_seeded_at IS NOT NULL (skips bots that abandoned mid-seed)
  * created_at < now - RETENTION_DAYS
  * no non-seeded content edits exist — i.e. every Article/LessonModule
    owned by them is in the demo_seed_ids_json manifest

Wired into APScheduler at 04:30 UTC daily.

Hand-callable for ops:
    docker compose exec backend python -m backend.scripts.demo_janitor
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..database import engine
from ..models import (
    Article,
    LessonModule,
    LessonPack,
    Pledge,
    Project,
    Tutor,
    User,
)
from ..services.demo_lifecycle import wipe_workspace

log = logging.getLogger(__name__)

RETENTION_DAYS = 30


def _has_user_edits(session: Session, user: User) -> bool:
    """True if the user created anything beyond their seeded manifest.
    Conservative: if we can't decode the manifest, assume yes (don't
    delete)."""
    try:
        manifest = json.loads(user.demo_seed_ids_json or "{}")
    except json.JSONDecodeError:
        return True
    if not isinstance(manifest, dict):
        return True

    seeded_articles = set(manifest.get("articles", []) or [])
    seeded_modules = set(manifest.get("modules", []) or [])
    seeded_lesson_packs = set(manifest.get("lesson_packs", []) or [])
    seeded_projects = set(manifest.get("projects", []) or [])

    # Tutor-owned content
    tutor = session.exec(select(Tutor).where(Tutor.user_id == user.id)).first()
    if tutor is not None:
        unseeded_articles = session.exec(
            select(Article.id).where(
                Article.tutor_id == tutor.id,
                ~Article.id.in_(seeded_articles or [-1]),
            )
        ).first()
        if unseeded_articles is not None:
            return True
        unseeded_modules = session.exec(
            select(LessonModule.id).where(
                LessonModule.tutor_id == tutor.id,
                ~LessonModule.id.in_(seeded_modules or [-1]),
            )
        ).first()
        if unseeded_modules is not None:
            return True
        unseeded_packs = session.exec(
            select(LessonPack.id).where(
                LessonPack.tutor_id == tutor.id,
                ~LessonPack.id.in_(seeded_lesson_packs or [-1]),
            )
        ).first()
        if unseeded_packs is not None:
            return True

    # Creator-owned content (Project rows). Pledges follow Projects.
    unseeded_projects = session.exec(
        select(Project.id).where(
            Project.teacher_id == user.id,
            ~Project.id.in_(seeded_projects or [-1]),
        )
    ).first()
    if unseeded_projects is not None:
        return True

    return False


def prune_demo_accounts(session: Session, now: datetime | None = None) -> dict:
    """Run the sweep. Returns counters for ops visibility."""
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=RETENTION_DAYS)
    stats = {"considered": 0, "kept_due_to_edits": 0, "pruned": 0}

    rows = session.exec(
        select(User).where(
            User.is_demo_account == True,    # noqa: E712
            User.demo_workspace_seeded_at.is_not(None),
            User.created_at < cutoff,
        )
    ).all()
    stats["considered"] = len(rows)

    for user in rows:
        if _has_user_edits(session, user):
            stats["kept_due_to_edits"] += 1
            continue

        # Wipe seeded content first (best-effort).
        try:
            wipe_workspace(session, user)
        except Exception:
            log.exception("janitor wipe failed for user_id=%s", user.id)

        # Drop any straggler Pledges + the Tutor row + the User row.
        # Pledges from synthetic backers should already be gone (manifest)
        # but defend in case the manifest was incomplete.
        for p in session.exec(
            select(Pledge).where(Pledge.user_id == user.id)
        ).all():
            session.delete(p)

        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == user.id)
        ).first()
        if tutor is not None:
            session.delete(tutor)

        session.delete(user)
        session.commit()
        stats["pruned"] += 1

    log.info("demo janitor finished: %s", stats)
    return stats


def run() -> dict:
    """Entry point for both the cron and the CLI invocation."""
    with Session(engine) as session:
        return prune_demo_accounts(session)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run())
