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

from sqlalchemy import text
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


def _purge_fk_children(
    session: Session, parent_table: str, parent_id: int
) -> None:
    """Delete every row in any table that has a FOREIGN KEY referencing
    `parent_table.id == parent_id`. Discovers the children at runtime
    from information_schema so the helper survives schema growth — when
    we add a new `tutor_*` table that FKs to Tutor (or `*_user_id` to
    User), no manual list edit is needed.

    Child tables may have FKs between THEMSELVES (e.g. pledge → project,
    module_purchase → lesson_module), so a single pass may hit
    constraint errors. We use savepoints to roll back ONLY the failing
    DELETE and retry until either everything succeeds or a pass makes
    no progress.

    Postgres-only (uses the standard information_schema views).
    """
    from sqlalchemy.exc import IntegrityError

    rows = session.execute(
        text(
            """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
                AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = :parent
              AND ccu.column_name = 'id'
            """
        ),
        {"parent": parent_table},
    ).all()

    remaining = list(rows)
    # Bound the retries so a genuinely impossible FK doesn't loop forever.
    for _ in range(len(remaining) + 1):
        if not remaining:
            return
        next_round: list = []
        progress = False
        for table, column in remaining:
            sp = session.begin_nested()
            try:
                # Parameter binding doesn't work for identifiers, so
                # build the SQL with f-string — values come ONLY from
                # information_schema (not user input).
                session.execute(
                    text(f'DELETE FROM "{table}" WHERE "{column}" = :pid'),
                    {"pid": parent_id},
                )
                sp.commit()
                progress = True
            except IntegrityError:
                sp.rollback()
                next_round.append((table, column))
        remaining = next_round
        if not progress:
            break

    if remaining:
        log.warning(
            "demo janitor: %d child tables of %s.id=%s could not be "
            "purged after exhaustive retry: %s",
            len(remaining),
            parent_table,
            parent_id,
            [t for t, _ in remaining],
        )


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
    return unseeded_projects is not None


def prune_demo_accounts(session: Session, now: datetime | None = None) -> dict:
    """Run the sweep. Returns counters for ops visibility.

    Two pools of eligible users:
    1. Soft-deleted demo users — `user.deleted_at IS NOT NULL`. These
       were already removed from the system's "active" surface; we hard
       delete unconditionally, bypassing the retention window and the
       has-edits check.
    2. Unconverted demo users older than `RETENTION_DAYS` — the original
       sweep cohort. Skipped if `_has_user_edits` finds anything beyond
       the seeded manifest.
    """
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=RETENTION_DAYS)
    stats = {
        "considered": 0,
        "kept_due_to_edits": 0,
        "pruned": 0,
        "pruned_soft_deleted": 0,
    }

    # Pool 1: already soft-deleted — hard delete immediately.
    soft_deleted = session.exec(
        select(User).where(
            User.is_demo_account == True,    # noqa: E712
            User.deleted_at.is_not(None),
        )
    ).all()
    for user in soft_deleted:
        _hard_delete_demo_user(session, user)
        stats["pruned_soft_deleted"] += 1

    # Pool 2: unconverted demos past retention.
    rows = session.exec(
        select(User).where(
            User.is_demo_account == True,    # noqa: E712
            User.demo_workspace_seeded_at.is_not(None),
            User.created_at < cutoff,
            User.deleted_at.is_(None),
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

        _hard_delete_demo_user(session, user)
        stats["pruned"] += 1

    log.info("demo janitor finished: %s", stats)
    return stats


def _hard_delete_demo_user(session: Session, user: User) -> None:
    """Hard-delete a demo user + their Tutor + every FK child of either.

    `_purge_fk_children` discovers child tables at runtime via
    information_schema, so this handles schema growth — newly added
    `tutor_*` or `*_user_id` tables get cleaned automatically. Commits
    on success so a downstream user's failure doesn't roll back the
    work done for earlier users.
    """
    # Find the tutor first; it has its own family of child tables.
    tutor = session.exec(
        select(Tutor).where(Tutor.user_id == user.id)
    ).first()
    if tutor is not None:
        _purge_fk_children(session, "tutor", tutor.id)
        session.delete(tutor)

    # Stragglers tied directly to User. _purge_fk_children handles
    # everything that FKs to user.id — Pledges, Comments, etc.
    _purge_fk_children(session, "user", user.id)
    session.delete(user)
    session.commit()


def run() -> dict:
    """Entry point for both the cron and the CLI invocation."""
    with Session(engine) as session:
        return prune_demo_accounts(session)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run())
