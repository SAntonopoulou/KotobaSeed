"""Referral + affiliate program tables.

ReferralCode, ReferralAttribution, ReferralReward, AffiliateApplication,
LessonCredit.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260608b_referrals"
down_revision: str | None = "20260608_group_and_recurring"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "referral_code",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False, unique=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
    )
    op.create_index("ix_referral_code_user_id", "referral_code", ["user_id"])
    op.create_index("ix_referral_code_code", "referral_code", ["code"])
    op.create_index("ix_referral_code_kind", "referral_code", ["kind"])

    op.create_table(
        "referral_attribution",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_id", sa.Integer(), nullable=False),
        sa.Column("referrer_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "referred_user_id", sa.Integer(), nullable=False, unique=True
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("first_qualified_at", sa.DateTime(), nullable=True),
        sa.Column("qualifying_amount_cents", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["code_id"], ["referral_code.id"]),
        sa.ForeignKeyConstraint(["referrer_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["referred_user_id"], ["user.id"]),
    )
    op.create_index("ix_attr_code_id", "referral_attribution", ["code_id"])
    op.create_index(
        "ix_attr_referrer", "referral_attribution", ["referrer_user_id"]
    )
    op.create_index(
        "ix_attr_referred", "referral_attribution", ["referred_user_id"]
    )
    op.create_index("ix_attr_kind", "referral_attribution", ["kind"])
    op.create_index(
        "ix_attr_qualified", "referral_attribution", ["first_qualified_at"]
    )

    op.create_table(
        "referral_reward",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("referrer_user_id", sa.Integer(), nullable=False),
        sa.Column("attribution_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("milestone_key", sa.String(length=64), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("earned_at", sa.DateTime(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("paid_via", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["referrer_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["attribution_id"], ["referral_attribution.id"]),
    )
    op.create_index("ix_reward_referrer", "referral_reward", ["referrer_user_id"])
    op.create_index(
        "ix_reward_attribution", "referral_reward", ["attribution_id"]
    )
    op.create_index("ix_reward_kind", "referral_reward", ["kind"])
    op.create_index("ix_reward_milestone", "referral_reward", ["milestone_key"])
    op.create_index("ix_reward_status", "referral_reward", ["status"])

    op.create_table(
        "affiliate_application",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("website_url", sa.String(length=2048), nullable=False),
        sa.Column("audience_description", sa.String(length=4000), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("admin_notes", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["user.id"]),
    )
    op.create_index("ix_aff_user", "affiliate_application", ["user_id"])
    op.create_index("ix_aff_status", "affiliate_application", ["status"])

    op.create_table(
        "lesson_credit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_on_booking_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["used_on_booking_id"], ["booking.id"]),
    )
    op.create_index("ix_credit_user", "lesson_credit", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_credit_user", table_name="lesson_credit")
    op.drop_table("lesson_credit")
    op.drop_index("ix_aff_status", table_name="affiliate_application")
    op.drop_index("ix_aff_user", table_name="affiliate_application")
    op.drop_table("affiliate_application")
    op.drop_index("ix_reward_status", table_name="referral_reward")
    op.drop_index("ix_reward_milestone", table_name="referral_reward")
    op.drop_index("ix_reward_kind", table_name="referral_reward")
    op.drop_index("ix_reward_attribution", table_name="referral_reward")
    op.drop_index("ix_reward_referrer", table_name="referral_reward")
    op.drop_table("referral_reward")
    op.drop_index("ix_attr_qualified", table_name="referral_attribution")
    op.drop_index("ix_attr_kind", table_name="referral_attribution")
    op.drop_index("ix_attr_referred", table_name="referral_attribution")
    op.drop_index("ix_attr_referrer", table_name="referral_attribution")
    op.drop_index("ix_attr_code_id", table_name="referral_attribution")
    op.drop_table("referral_attribution")
    op.drop_index("ix_referral_code_kind", table_name="referral_code")
    op.drop_index("ix_referral_code_code", table_name="referral_code")
    op.drop_index("ix_referral_code_user_id", table_name="referral_code")
    op.drop_table("referral_code")
