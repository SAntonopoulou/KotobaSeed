"""Phase 2 — cohort marketplace.

Two new tables:
- cohort       — tutor-posted group lesson series
- cohort_seat  — paid student seat in a cohort

Plus a soft-status enum on cohort (draft → open → confirmed/cancelled).
The cron sweep that auto-cancels under-subscribed cohorts at deadline
is wired up separately (services/cohort_sweep.py) and isn't part of
this DDL migration.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260627_cohorts"
down_revision: str | None = "20260626_article_engagement"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "cohort",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tutor_id", sa.Integer(), sa.ForeignKey("tutor.id"), nullable=False
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("languagegroup.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=4000), nullable=True),
        sa.Column("lesson_schedule_note", sa.String(length=500), nullable=True),
        sa.Column("num_lessons", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "price_per_seat_cents", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column("max_seats", sa.Integer(), nullable=False),
        sa.Column("min_seats", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_session_at", sa.DateTime(), nullable=False),
        sa.Column("enrollment_deadline", sa.DateTime(), nullable=False),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="draft"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_cohort_tutor_id", "cohort", ["tutor_id"])
    op.create_index("ix_cohort_group_id", "cohort", ["group_id"])
    op.create_index("ix_cohort_status", "cohort", ["status"])

    op.create_table(
        "cohort_seat",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "cohort_id", sa.Integer(), sa.ForeignKey("cohort.id"), nullable=False
        ),
        sa.Column(
            "tutor_id", sa.Integer(), sa.ForeignKey("tutor.id"), nullable=False
        ),
        sa.Column(
            "student_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "platform_fee_cents", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "stripe_checkout_session_id", sa.String(length=128), nullable=True
        ),
        sa.Column(
            "stripe_payment_intent_id", sa.String(length=128), nullable=True
        ),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "cohort_id", "student_user_id", name="uq_cohort_seat_pair"
        ),
    )
    op.create_index("ix_cohort_seat_cohort_id", "cohort_seat", ["cohort_id"])
    op.create_index("ix_cohort_seat_tutor_id", "cohort_seat", ["tutor_id"])
    op.create_index(
        "ix_cohort_seat_student_user_id", "cohort_seat", ["student_user_id"]
    )
    op.create_index(
        "ix_cohort_seat_stripe_checkout_session_id",
        "cohort_seat",
        ["stripe_checkout_session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cohort_seat_stripe_checkout_session_id", table_name="cohort_seat"
    )
    op.drop_index(
        "ix_cohort_seat_student_user_id", table_name="cohort_seat"
    )
    op.drop_index("ix_cohort_seat_tutor_id", table_name="cohort_seat")
    op.drop_index("ix_cohort_seat_cohort_id", table_name="cohort_seat")
    op.drop_table("cohort_seat")

    op.drop_index("ix_cohort_status", table_name="cohort")
    op.drop_index("ix_cohort_group_id", table_name="cohort")
    op.drop_index("ix_cohort_tutor_id", table_name="cohort")
    op.drop_table("cohort")
