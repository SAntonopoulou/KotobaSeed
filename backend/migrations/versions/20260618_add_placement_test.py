"""Add placement_test + placement_submission tables.

One placement test per tutor (unique constraint on tutor_id). Submissions
allow re-takes — each one is a new row.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260618_placement_test"
down_revision: str | None = "20260617_normalize_subscription_tier"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "placement_test",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False, unique=True),
        sa.Column(
            "title", sa.String(length=200), nullable=False, server_default="Placement test"
        ),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "level_bands_json", sa.Text(), nullable=False, server_default="[]"
        ),
        sa.Column("questions_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
    op.create_index("ix_placement_test_tutor_id", "placement_test", ["tutor_id"])
    op.create_index("ix_placement_test_is_active", "placement_test", ["is_active"])

    op.create_table(
        "placement_submission",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("answers_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "per_question_results_json",
            sa.Text(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("auto_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("level_label", sa.String(length=80), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
    )
    op.create_index(
        "ix_placement_submission_tutor", "placement_submission", ["tutor_id"]
    )
    op.create_index(
        "ix_placement_submission_student",
        "placement_submission",
        ["student_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_placement_submission_student", table_name="placement_submission"
    )
    op.drop_index("ix_placement_submission_tutor", table_name="placement_submission")
    op.drop_table("placement_submission")
    op.drop_index("ix_placement_test_is_active", table_name="placement_test")
    op.drop_index("ix_placement_test_tutor_id", table_name="placement_test")
    op.drop_table("placement_test")
