"""Add `testimonial` table for per-tutor student testimonials.

Tutor types the row in themselves on the dashboard — no student-submission
flow in v1 (abuse vectors with no upside until volume justifies it).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260615_testimonial"
down_revision: str | None = "20260614_article_lexical_json"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "testimonial",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_name", sa.String(length=120), nullable=False),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
    op.create_index("ix_testimonial_tutor_id", "testimonial", ["tutor_id"])
    op.create_index("ix_testimonial_display_order", "testimonial", ["display_order"])
    op.create_index("ix_testimonial_is_published", "testimonial", ["is_published"])


def downgrade() -> None:
    op.drop_index("ix_testimonial_is_published", table_name="testimonial")
    op.drop_index("ix_testimonial_display_order", table_name="testimonial")
    op.drop_index("ix_testimonial_tutor_id", table_name="testimonial")
    op.drop_table("testimonial")
