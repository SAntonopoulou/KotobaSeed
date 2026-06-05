"""Add `cancellation_cutoff_hours` to tutor.

48-hour platform floor on student cancellations. Default 48 so existing
tutors get sane behaviour automatically; they can ratchet it higher
(stricter) from the dashboard.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260613_cancellation_cutoff"
down_revision: str | None = "20260612_list_in_marketplace"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "cancellation_cutoff_hours",
                sa.Integer(),
                nullable=False,
                server_default="48",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("cancellation_cutoff_hours")
