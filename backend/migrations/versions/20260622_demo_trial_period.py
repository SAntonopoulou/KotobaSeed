"""Monthly vs total period for demo classroom trials.

Adds three columns:
- demo_trial_minutes_allocated: original cap (for monthly resets)
- demo_trial_period: "total" or "monthly" (NULL on legacy rows)
- demo_trial_period_anchor: when the current rolling 30-day window started

Backfill: existing rows get period="total" and allocated=remaining so
the cron + mint logic treats them identically to before.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# Merges two pre-existing heads (tutor_theme + demo_trial) into one
# linear chain. Without this, alembic refuses to upgrade.
revision: str = "20260622_demo_trial_period"
down_revision: tuple[str, str] = ("20260606_tutor_theme", "20260620f_demo_trial")
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(sa.Column("demo_trial_minutes_allocated", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("demo_trial_period", sa.String(length=16), nullable=True))
        batch.add_column(sa.Column("demo_trial_period_anchor", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE "user"
        SET demo_trial_period = 'total',
            demo_trial_minutes_allocated = demo_trial_minutes_remaining
        WHERE is_demo_trial = TRUE AND demo_trial_period IS NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.drop_column("demo_trial_period_anchor")
        batch.drop_column("demo_trial_period")
        batch.drop_column("demo_trial_minutes_allocated")
