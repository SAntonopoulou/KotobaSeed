"""Per-article piecemeal pricing + ArticlePurchase + PremiumArticleRead.

Adds:
- article.price_cents (int, default 0) + article.currency (varchar)
- article_purchase table (mirrors module_purchase)
- premium_article_read table for monthly creator-pool tracking

Plus subscribers don't generate ArticlePurchase rows — their access
is gated by User.subscription_tier in the application layer.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260624_article_pricing"
down_revision: str | None = "20260623_article_preview"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.add_column(
            sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="eur")
        )

    op.create_table(
        "article_purchase",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=False
        ),
        sa.Column(
            "tutor_id", sa.Integer(), sa.ForeignKey("tutor.id"), nullable=False
        ),
        sa.Column(
            "student_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("platform_fee_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="eur"),
        sa.Column("stripe_checkout_session_id", sa.String(length=128), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "article_id", "student_user_id", name="uq_article_purchase_pair"
        ),
    )
    op.create_index(
        "ix_article_purchase_article_id", "article_purchase", ["article_id"]
    )
    op.create_index("ix_article_purchase_tutor_id", "article_purchase", ["tutor_id"])
    op.create_index(
        "ix_article_purchase_student_user_id",
        "article_purchase",
        ["student_user_id"],
    )
    op.create_index(
        "ix_article_purchase_stripe_checkout_session_id",
        "article_purchase",
        ["stripe_checkout_session_id"],
    )
    op.create_index(
        "ix_article_purchase_stripe_payment_intent_id",
        "article_purchase",
        ["stripe_payment_intent_id"],
    )

    op.create_table(
        "premium_article_read",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=False
        ),
        sa.Column(
            "tutor_id", sa.Integer(), sa.ForeignKey("tutor.id"), nullable=False
        ),
        sa.Column(
            "student_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=False),
        sa.Column("dwell_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scroll_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "article_id",
            "student_user_id",
            "year_month",
            name="uq_premium_read_triple",
        ),
    )
    op.create_index(
        "ix_premium_article_read_article_id",
        "premium_article_read",
        ["article_id"],
    )
    op.create_index(
        "ix_premium_article_read_tutor_id",
        "premium_article_read",
        ["tutor_id"],
    )
    op.create_index(
        "ix_premium_article_read_student_user_id",
        "premium_article_read",
        ["student_user_id"],
    )
    op.create_index(
        "ix_premium_article_read_year_month",
        "premium_article_read",
        ["year_month"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_premium_article_read_year_month", table_name="premium_article_read"
    )
    op.drop_index(
        "ix_premium_article_read_student_user_id",
        table_name="premium_article_read",
    )
    op.drop_index(
        "ix_premium_article_read_tutor_id", table_name="premium_article_read"
    )
    op.drop_index(
        "ix_premium_article_read_article_id", table_name="premium_article_read"
    )
    op.drop_table("premium_article_read")

    op.drop_index(
        "ix_article_purchase_stripe_payment_intent_id",
        table_name="article_purchase",
    )
    op.drop_index(
        "ix_article_purchase_stripe_checkout_session_id",
        table_name="article_purchase",
    )
    op.drop_index(
        "ix_article_purchase_student_user_id", table_name="article_purchase"
    )
    op.drop_index("ix_article_purchase_tutor_id", table_name="article_purchase")
    op.drop_index(
        "ix_article_purchase_article_id", table_name="article_purchase"
    )
    op.drop_table("article_purchase")

    with op.batch_alter_table("article") as batch:
        batch.drop_column("currency")
        batch.drop_column("price_cents")
