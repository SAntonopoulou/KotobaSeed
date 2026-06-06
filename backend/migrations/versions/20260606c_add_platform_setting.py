"""Add platform_setting key/value table for admin-managed configuration."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260606c_platform_setting"
down_revision: str | None = "20260606b_password_reset"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "platform_setting",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.id"]),
    )


def downgrade() -> None:
    op.drop_table("platform_setting")
