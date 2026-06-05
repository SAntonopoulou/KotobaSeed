"""Add stripe_webhook_event table for webhook idempotency.

The Stripe webhook can fire the same event multiple times (retries on
non-2xx, network blips, etc). Without dedup, our handlers would double-
process tip credits, over-grant priority credits, etc. The table records
each processed event_id so handlers can short-circuit on repeats.
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "20260605_stripe_webhook_event"
down_revision: str | None = "20260605_user_profile_public"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "stripe_webhook_event",
        sa.Column("event_id", sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column("event_type", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("stripe_webhook_event")
