"""Add lesson_pack table.

The tutor-side product: "5 lessons for €100" etc. Students buy a pack and
the credits get consumed across bookings.
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "20260606_lesson_pack"
down_revision: str | None = "20260606_audit_log"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "lesson_pack",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=4000), nullable=True),
        sa.Column("num_lessons", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(length=3), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lesson_pack_tutor_id", "lesson_pack", ["tutor_id"])
    op.create_index("ix_lesson_pack_is_active", "lesson_pack", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_lesson_pack_is_active", table_name="lesson_pack")
    op.drop_index("ix_lesson_pack_tutor_id", table_name="lesson_pack")
    op.drop_table("lesson_pack")
