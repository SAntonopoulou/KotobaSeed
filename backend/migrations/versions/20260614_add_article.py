"""Add `article` table for per-tutor markdown content.

Slugs are unique per tutor (composite uniqueness on (tutor_id, slug)) so
two tutors can both have an article named "welcome" without colliding.
Published flag drives the public list visibility.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260614_article"
down_revision: str | None = "20260613_cancellation_cutoff"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "article",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.UniqueConstraint("tutor_id", "slug", name="uq_article_tutor_slug"),
    )
    op.create_index("ix_article_tutor_id", "article", ["tutor_id"])
    op.create_index("ix_article_slug", "article", ["slug"])
    op.create_index("ix_article_is_published", "article", ["is_published"])


def downgrade() -> None:
    op.drop_index("ix_article_is_published", table_name="article")
    op.drop_index("ix_article_slug", table_name="article")
    op.drop_index("ix_article_tutor_id", table_name="article")
    op.drop_table("article")
