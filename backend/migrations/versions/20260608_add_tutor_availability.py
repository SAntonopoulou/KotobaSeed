"""Add tutor_availability table.

Recurring weekly windows per tutor. Times are minutes-from-midnight in the
tutor's own timezone (User.timezone), so a 09:30 → 1020 block "moves" with
DST in whatever way the local TZ does.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260608_tutor_availability"
down_revision: str | None = "20260607_creator_rename"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "tutor_availability",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tutor_availability_tutor_id", "tutor_availability", ["tutor_id"])
    op.create_index("ix_tutor_availability_weekday", "tutor_availability", ["weekday"])


def downgrade() -> None:
    op.drop_index("ix_tutor_availability_weekday", table_name="tutor_availability")
    op.drop_index("ix_tutor_availability_tutor_id", table_name="tutor_availability")
    op.drop_table("tutor_availability")
