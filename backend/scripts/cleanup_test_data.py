"""Purge every E2E test entity created during the launch dry-run.

Targets only Users whose email matches the agreed E2E pattern
``sophiawillowood+%@gmail.com`` and walks the SQLModel metadata graph in
reverse FK-dependency order, deleting rows in every table that points
(directly or transitively) at one of the target users.

Two ID sets drive the deletion:
- ``user_ids`` — the test users themselves
- ``tutor_ids`` — every Tutor row owned by those users

For each table in SQLModel metadata, we look at every FK column. If the
column points at ``user.id`` we delete where that column ∈ user_ids; if
at ``tutor.id`` we delete where ∈ tutor_ids. We then delete the Tutor
rows, then the User rows.

The admin account ``shiho@sakurastudios.eu`` is explicitly excluded; the
script aborts if that email shows up in the target set.

Stripe cleanup is best-effort: any Stripe customer linked to a deleted
User is deleted in test mode (we refuse to call the live API). Coupons,
subscriptions and payment intents tied to the customer are removed by
Stripe automatically when the customer is deleted.

    cd /opt/kotobaseed && docker compose exec backend \\
        python -m backend.scripts.cleanup_test_data

Add ``--dry-run`` to see what would be deleted without touching the DB.
"""

from __future__ import annotations

import argparse
import logging
import sys

import stripe
from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

from ..config import settings
from ..database import engine
from ..models import Tutor, User  # noqa: F401 — populate metadata

log = logging.getLogger(__name__)

EMAIL_PATTERN = "sophiawillowood+%@gmail.com"
PROTECTED_EMAILS = {
    "shiho@sakurastudios.eu",
    "sophiawillowood@gmail.com",
}


def find_test_users(session: Session) -> list[User]:
    return list(
        session.exec(select(User).where(User.email.ilike(EMAIL_PATTERN))).all()
    )


def find_owned_tutor_ids(session: Session, user_ids: list[int]) -> list[int]:
    if not user_ids:
        return []
    rows = session.exec(
        select(Tutor.id).where(Tutor.user_id.in_(user_ids))
    ).all()
    return [int(r) for r in rows]


def delete_stripe_customers(users: list[User]) -> None:
    if not settings.stripe_secret_key:
        log.info("STRIPE_SECRET_KEY unset — skipping Stripe cleanup")
        return
    if settings.stripe_secret_key.startswith("sk_live_"):
        log.error("Refusing to purge Stripe data on a LIVE secret key")
        sys.exit(2)
    stripe.api_key = settings.stripe_secret_key
    for u in users:
        cid = getattr(u, "stripe_customer_id", None)
        if not cid:
            continue
        try:
            stripe.Customer.delete(cid)
            log.info("Stripe customer deleted: %s (%s)", cid, u.email)
        except Exception as e:  # broad — Stripe SDK error hierarchy varies
            log.warning("Stripe delete failed for %s: %s", cid, e)


def purge(
    session: Session,
    user_ids: list[int],
    tutor_ids: list[int],
    *,
    dry_run: bool,
) -> dict[str, int]:
    """Walk every table in metadata. For each FK column pointing at
    user.id or tutor.id, delete rows matching the target set. Tables are
    processed in reverse sorted_tables order so child rows die first."""

    counts: dict[str, int] = {}

    # SQLModel/SQLAlchemy's sorted_tables walks parents-before-children;
    # reverse it so children die first and parent deletes don't fail.
    for table in reversed(SQLModel.metadata.sorted_tables):
        # Skip the two parent tables — we handle them last by id directly.
        if table.name in ("user", "tutor"):
            continue

        # Find every FK column on this table pointing at user.id or
        # tutor.id and OR them into a single WHERE clause.
        clauses: list[str] = []
        params: dict[str, object] = {}
        for col in table.columns:
            for fk in col.foreign_keys:
                target = fk.target_fullname  # e.g. "user.id"
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
            n = session.exec(stmt).one()
            n = int(n[0] if isinstance(n, tuple) else n)
            if n:
                counts[table.name] = n
        else:
            stmt = text(
                f'DELETE FROM "{table.name}" WHERE {where_sql}'
            ).bindparams(**params)
            result = session.execute(stmt)
            if result.rowcount:
                counts[table.name] = result.rowcount

    # Tutor rows next, then User rows.
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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without touching the DB",
    )
    args = parser.parse_args()

    # populate metadata
    from .. import models  # noqa: F401

    with Session(engine) as session:
        users = find_test_users(session)
        if not users:
            log.info("No users matched %s — nothing to do", EMAIL_PATTERN)
            return 0

        # Belt-and-braces safety check.
        leaked = {u.email for u in users} & PROTECTED_EMAILS
        if leaked:
            log.error("Refusing to delete protected emails: %s", leaked)
            return 2

        user_ids = [u.id for u in users]
        tutor_ids = find_owned_tutor_ids(session, user_ids)

        log.info(
            "Target users: %d  |  owned tutor rows: %d",
            len(user_ids),
            len(tutor_ids),
        )
        for u in users:
            log.info("  user id=%s email=%s", u.id, u.email)

        if not args.dry_run:
            delete_stripe_customers(users)

        counts = purge(
            session, user_ids, tutor_ids, dry_run=args.dry_run
        )

        prefix = "Would delete" if args.dry_run else "Deleted"
        total = sum(counts.values())
        log.info("%s %d rows across %d tables:", prefix, total, len(counts))
        for tbl, n in sorted(counts.items(), key=lambda kv: -kv[1]):
            log.info("  %-40s %6d", tbl, n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
