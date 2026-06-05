"""Add tutor_subscription_plan + student_tutor_subscription tables.

One plan per tutor + many student subscriptions to that tutor's content.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_tutor_subscriptions"
down_revision: str | None = "20260619_modules_and_premium"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "tutor_subscription_plan",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
    op.create_index(
        "ix_tutor_subscription_plan_tutor", "tutor_subscription_plan", ["tutor_id"]
    )
    op.create_index(
        "ix_tutor_subscription_plan_active",
        "tutor_subscription_plan",
        ["is_active"],
    )

    op.create_table(
        "student_tutor_subscription",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="unpaid"
        ),
        sa.Column("stripe_subscription_id", sa.String(length=128), nullable=True),
        sa.Column("stripe_customer_id", sa.String(length=128), nullable=True),
        sa.Column(
            "stripe_price_cents_snapshot",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column(
            "cancel_at_period_end",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_student_tutor_sub_pair"
        ),
    )
    op.create_index(
        "ix_student_tutor_sub_tutor", "student_tutor_subscription", ["tutor_id"]
    )
    op.create_index(
        "ix_student_tutor_sub_student",
        "student_tutor_subscription",
        ["student_user_id"],
    )
    op.create_index(
        "ix_student_tutor_sub_status", "student_tutor_subscription", ["status"]
    )
    op.create_index(
        "ix_student_tutor_sub_stripe",
        "student_tutor_subscription",
        ["stripe_subscription_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_student_tutor_sub_stripe", table_name="student_tutor_subscription"
    )
    op.drop_index(
        "ix_student_tutor_sub_status", table_name="student_tutor_subscription"
    )
    op.drop_index(
        "ix_student_tutor_sub_student", table_name="student_tutor_subscription"
    )
    op.drop_index(
        "ix_student_tutor_sub_tutor", table_name="student_tutor_subscription"
    )
    op.drop_table("student_tutor_subscription")
    op.drop_index(
        "ix_tutor_subscription_plan_active", table_name="tutor_subscription_plan"
    )
    op.drop_index(
        "ix_tutor_subscription_plan_tutor", table_name="tutor_subscription_plan"
    )
    op.drop_table("tutor_subscription_plan")
