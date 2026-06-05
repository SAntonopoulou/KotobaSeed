"""Add `newsletter` + `newsletter_unsubscribe` tables.

Per-tutor newsletter drafts + history. Unsubscribe table keys on
student_user_id so the same student unsubscribed from one tutor still
receives from another.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260616_newsletter"
down_revision: str | None = "20260615_tutor_email_template"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "newsletter",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("recipient_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_test_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
    op.create_index("ix_newsletter_tutor_id", "newsletter", ["tutor_id"])
    op.create_index("ix_newsletter_status", "newsletter", ["status"])

    op.create_table(
        "newsletter_unsubscribe",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("unsubscribed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_newsletter_unsub_pair"
        ),
    )
    op.create_index(
        "ix_newsletter_unsub_tutor_id", "newsletter_unsubscribe", ["tutor_id"]
    )
    op.create_index(
        "ix_newsletter_unsub_student",
        "newsletter_unsubscribe",
        ["student_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_newsletter_unsub_student", table_name="newsletter_unsubscribe"
    )
    op.drop_index(
        "ix_newsletter_unsub_tutor_id", table_name="newsletter_unsubscribe"
    )
    op.drop_table("newsletter_unsubscribe")
    op.drop_index("ix_newsletter_status", table_name="newsletter")
    op.drop_index("ix_newsletter_tutor_id", table_name="newsletter")
    op.drop_table("newsletter")
