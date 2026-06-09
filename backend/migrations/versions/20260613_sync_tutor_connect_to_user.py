"""Backfill User.stripe_account_id from Tutor.stripe_connect_account_id.

Tutors whose Connect onboarding finished before the connect-sync helper
landed had the Stripe account stamped on the Tutor row but never on the
User row. That broke the apex marketplace flow (which still keys off
User.stripe_account_id) for those tutors — pledges failed silently.

This migration copies the Tutor → User one-way mirror so existing tutors
match the new convention without needing to redo Connect onboarding.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260613_sync_tutor_connect_to_user"
down_revision: str | None = "20260612_backfill_tutor_verifications"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    table_names = set(inspector.get_table_names())
    if "tutor" not in table_names or "user" not in table_names:
        return

    # For every tutor with a Connect account, if the owning user has no
    # stripe_account_id or a different one, mirror the tutor's. We loop
    # in Python so the migration is portable across SQLite + Postgres
    # (multi-table UPDATE syntax differs). The capability flags stay
    # zeroed — the webhook populates them on the next account.updated.
    pairs = conn.execute(
        sa.text(
            """
            SELECT t.user_id, t.stripe_connect_account_id
            FROM tutor t
            WHERE t.stripe_connect_account_id IS NOT NULL
              AND t.stripe_connect_account_id <> ''
            """
        )
    ).fetchall()
    for user_id, acct in pairs:
        conn.execute(
            sa.text(
                'UPDATE "user" SET stripe_account_id = :acct '
                'WHERE id = :uid '
                'AND (stripe_account_id IS NULL OR stripe_account_id <> :acct)'
            ),
            {"acct": acct, "uid": user_id},
        )


def downgrade() -> None:
    # Reversal would only be useful if a tutor genuinely had a separate
    # User-side Connect account from their Tutor-side one. Modern signups
    # never produce that state, so downgrade is a no-op.
    pass
