"""Add tutor.theme — Pro+ curated theme bundle key.

Defaults to 'sage' for every existing tutor, so nothing changes visually
until a Pro+ tutor picks a different theme from the dashboard.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260606_tutor_theme"
down_revision: str | None = "20260620_grading_credits"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "theme",
                sa.String(length=32),
                nullable=False,
                server_default="sage",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("theme")
