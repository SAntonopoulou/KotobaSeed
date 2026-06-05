"""Add homework_template + homework_assignment + homework_submission tables."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_homework"
down_revision: str | None = "20260616_newsletter"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "homework_template",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("questions_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column(
            "auto_assign_on_lesson_complete",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
    op.create_index("ix_homework_template_tutor_id", "homework_template", ["tutor_id"])
    op.create_index(
        "ix_homework_template_auto_assign",
        "homework_template",
        ["auto_assign_on_lesson_complete"],
    )
    op.create_index("ix_homework_template_is_active", "homework_template", ["is_active"])

    op.create_table(
        "homework_assignment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "questions_snapshot_json", sa.Text(), nullable=False, server_default="[]"
        ),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["homework_template.id"]),
    )
    op.create_index(
        "ix_homework_assignment_tutor_id", "homework_assignment", ["tutor_id"]
    )
    op.create_index(
        "ix_homework_assignment_student", "homework_assignment", ["student_user_id"]
    )
    op.create_index("ix_homework_assignment_status", "homework_assignment", ["status"])

    op.create_table(
        "homework_submission",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("assignment_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("answers_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "per_question_results_json", sa.Text(), nullable=False, server_default="{}"
        ),
        sa.Column("auto_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("manual_score", sa.Integer(), nullable=True),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "needs_manual_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("feedback", sa.String(length=4000), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.Column("graded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["homework_assignment.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
    )
    op.create_index(
        "ix_homework_submission_student", "homework_submission", ["student_user_id"]
    )
    op.create_index(
        "ix_homework_submission_needs_review",
        "homework_submission",
        ["needs_manual_review"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homework_submission_needs_review", table_name="homework_submission"
    )
    op.drop_index("ix_homework_submission_student", table_name="homework_submission")
    op.drop_table("homework_submission")
    op.drop_index("ix_homework_assignment_status", table_name="homework_assignment")
    op.drop_index("ix_homework_assignment_student", table_name="homework_assignment")
    op.drop_index("ix_homework_assignment_tutor_id", table_name="homework_assignment")
    op.drop_table("homework_assignment")
    op.drop_index("ix_homework_template_is_active", table_name="homework_template")
    op.drop_index("ix_homework_template_auto_assign", table_name="homework_template")
    op.drop_index("ix_homework_template_tutor_id", table_name="homework_template")
    op.drop_table("homework_template")
