"""Add `tutor_email_template` table.

Per-tutor overrides for transactional email subjects + markdown bodies.
Composite uniqueness on (tutor_id, template_key) so each tutor has at
most one row per template type — missing rows fall back to the platform
default at send time.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260615_tutor_email_template"
down_revision: str | None = "20260615_testimonial"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "tutor_email_template",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("template_key", sa.String(length=80), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.UniqueConstraint(
            "tutor_id", "template_key", name="uq_tutor_email_template_key"
        ),
    )
    op.create_index(
        "ix_tutor_email_template_tutor_id", "tutor_email_template", ["tutor_id"]
    )
    op.create_index(
        "ix_tutor_email_template_template_key",
        "tutor_email_template",
        ["template_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tutor_email_template_template_key", table_name="tutor_email_template"
    )
    op.drop_index(
        "ix_tutor_email_template_tutor_id", table_name="tutor_email_template"
    )
    op.drop_table("tutor_email_template")
