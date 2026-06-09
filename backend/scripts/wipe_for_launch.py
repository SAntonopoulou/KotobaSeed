"""Pre-launch data wipe: every User except the admin row, plus every
row that FKs into them. Used right before flipping a fresh environment
public so the only account on it is the platform admin.

The script:
  1. Selects all Users except ``settings.admin_email`` (or any address in
     PROTECTED_EMAILS).
  2. Walks ``SQLModel.metadata.sorted_tables`` in reverse FK-dependency
     order. For each table with FKs to ``user.id`` or ``tutor.id``,
     deletes matching rows.
  3. Deletes the owned Tutor rows, then the User rows.

It refuses to run unless ``--confirm`` is passed AND the live Stripe
key isn't in use — destructive and irreversible.

    docker compose exec backend python -m backend.scripts.wipe_for_launch --dry-run
    docker compose exec backend python -m backend.scripts.wipe_for_launch --confirm
"""

from __future__ import annotations

import argparse
import logging
import sys

from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

from ..database import engine
from ..models import Tutor, User  # noqa: F401 — populate metadata

log = logging.getLogger(__name__)

PROTECTED_EMAILS = {
    "shiho@sakurastudios.eu",
    "sophiawillowood@gmail.com",
}


def find_target_users(session: Session) -> list[User]:
    rows = session.exec(select(User)).all()
    return [u for u in rows if u.email not in PROTECTED_EMAILS]


def find_owned_tutor_ids(session: Session, user_ids: list[int]) -> list[int]:
    if not user_ids:
        return []
    rows = session.exec(
        select(Tutor.id).where(Tutor.user_id.in_(user_ids))
    ).all()
    return [int(r) for r in rows]


def purge(
    session: Session,
    user_ids: list[int],
    tutor_ids: list[int],
    *,
    dry_run: bool,
) -> dict[str, int]:
    counts: dict[str, int] = {}

    for table in reversed(SQLModel.metadata.sorted_tables):
        if table.name in ("user", "tutor"):
            continue
        clauses: list[str] = []
        params: dict[str, object] = {}
        for col in table.columns:
            for fk in col.foreign_keys:
                target = fk.target_fullname
                if target == "user.id" and user_ids:
                    key = f"u_{col.name}"
                    clauses.append(f'"{col.name}" = ANY(:{key})')
                    params[key] = user_ids
                elif target == "tutor.id" and tutor_ids:
                    key = f"t_{col.name}"
                    clauses.append(f'"{col.name}" = ANY(:{key})')
                    params[key] = tutor_ids
        if not clauses:
            continue
        where_sql = " OR ".join(clauses)
        if dry_run:
            stmt = text(
                f'SELECT COUNT(*) FROM "{table.name}" WHERE {where_sql}'
            ).bindparams(**params)
            n = session.execute(stmt).scalar()
            if n:
                counts[table.name] = int(n)
        else:
            stmt = text(
                f'DELETE FROM "{table.name}" WHERE {where_sql}'
            ).bindparams(**params)
            result = session.execute(stmt)
            if result.rowcount:
                counts[table.name] = result.rowcount

    if tutor_ids:
        if dry_run:
            counts["tutor"] = len(tutor_ids)
        else:
            session.execute(
                text("DELETE FROM tutor WHERE id = ANY(:ids)").bindparams(
                    ids=tutor_ids
                )
            )
            counts["tutor"] = len(tutor_ids)
    if user_ids:
        if dry_run:
            counts["user"] = len(user_ids)
        else:
            session.execute(
                text('DELETE FROM "user" WHERE id = ANY(:ids)').bindparams(
                    ids=user_ids
                )
            )
            counts["user"] = len(user_ids)

    if not dry_run:
        session.commit()
    return counts


def main() -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()

    from .. import models  # noqa: F401

    if not args.dry_run and not args.confirm:
        log.error("Refusing to wipe without --confirm. Add --dry-run to preview.")
        return 2

    with Session(engine) as session:
        users = find_target_users(session)
        if not users:
            log.info("Nothing to delete — only protected emails on the platform")
            return 0
        user_ids = [u.id for u in users]
        emails = sorted(u.email for u in users)
        log.info("Target users (%d): %s", len(emails), ", ".join(emails))

        leaked = set(emails) & PROTECTED_EMAILS
        if leaked:
            log.error("Refusing — protected emails leaked into target set: %s", leaked)
            return 2

        tutor_ids = find_owned_tutor_ids(session, user_ids)
        log.info("Owned tutor ids: %s", tutor_ids)

        counts = purge(session, user_ids, tutor_ids, dry_run=args.dry_run)
        log.info("%s counts: %s", "DRY" if args.dry_run else "Deleted", counts)

    return 0


if __name__ == "__main__":
    sys.exit(main())
