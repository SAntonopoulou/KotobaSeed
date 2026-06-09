"""Phase 1B engagement layer — article comments + ratings + denorm.

Adds:
- Article columns: comments_enabled, rating_avg, rating_count
- article_comment table (threaded, soft-hide moderation)
- article_rating table (unique on article+user, 1-5 stars + optional body)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260626_article_engagement"
down_revision: str | None = "20260625_language_groups"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.add_column(
            sa.Column(
                "comments_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("rating_avg", sa.Float(), nullable=True))
        batch.add_column(
            sa.Column(
                "rating_count", sa.Integer(), nullable=False, server_default="0"
            )
        )

    op.create_table(
        "article_comment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=False
        ),
        sa.Column(
            "author_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("article_comment.id"),
            nullable=True,
        ),
        sa.Column("body_markdown", sa.String(length=4000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("hidden_at", sa.DateTime(), nullable=True),
        sa.Column(
            "hidden_by_tutor",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_article_comment_article_id", "article_comment", ["article_id"]
    )
    op.create_index(
        "ix_article_comment_author_user_id",
        "article_comment",
        ["author_user_id"],
    )
    op.create_index(
        "ix_article_comment_parent_id", "article_comment", ["parent_id"]
    )

    op.create_table(
        "article_rating",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("body", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "article_id", "user_id", name="uq_article_rating_pair"
        ),
    )
    op.create_index(
        "ix_article_rating_article_id", "article_rating", ["article_id"]
    )
    op.create_index(
        "ix_article_rating_user_id", "article_rating", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_article_rating_user_id", table_name="article_rating")
    op.drop_index("ix_article_rating_article_id", table_name="article_rating")
    op.drop_table("article_rating")

    op.drop_index("ix_article_comment_parent_id", table_name="article_comment")
    op.drop_index(
        "ix_article_comment_author_user_id", table_name="article_comment"
    )
    op.drop_index(
        "ix_article_comment_article_id", table_name="article_comment"
    )
    op.drop_table("article_comment")

    with op.batch_alter_table("article") as batch:
        batch.drop_column("rating_count")
        batch.drop_column("rating_avg")
        batch.drop_column("comments_enabled")
