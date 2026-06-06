"""Add per-grading pricing + grading credit ledger + payment audit table.

Changes:
- homework_template.grading_price_cents (existing currency reused)
- tutor_subscription_plan.monthly_grading_credits + credits_roll_over
- homework_assignment.grading_price_cents + grading_currency (snapshots)
- homework_submission.grading_paid (default True for backwards-compat)
- new student_grading_credit_balance table (per tutor/student running
  total + period stamp for idempotent refills)
- new homework_grading_payment table (audit trail for each grading event,
  composite-unique on submission_id so webhook retries don't double-charge)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620_grading_credits"
down_revision: str | None = "20260619_article_visibility"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("homework_template") as batch:
        batch.add_column(
            sa.Column(
                "grading_price_cents",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )

    with op.batch_alter_table("tutor_subscription_plan") as batch:
        batch.add_column(
            sa.Column(
                "monthly_grading_credits",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch.add_column(
            sa.Column(
                "credits_roll_over",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    with op.batch_alter_table("homework_assignment") as batch:
        batch.add_column(
            sa.Column(
                "grading_price_cents",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch.add_column(
            sa.Column(
                "grading_currency",
                sa.String(length=3),
                nullable=False,
                server_default="eur",
            )
        )

    with op.batch_alter_table("homework_submission") as batch:
        batch.add_column(
            sa.Column(
                "grading_paid",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
    op.create_index(
        "ix_homework_submission_grading_paid",
        "homework_submission",
        ["grading_paid"],
    )

    op.create_table(
        "student_grading_credit_balance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("available", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_refilled_period_end", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_grading_credit_pair"
        ),
    )
    op.create_index(
        "ix_grading_credit_tutor", "student_grading_credit_balance", ["tutor_id"]
    )
    op.create_index(
        "ix_grading_credit_student",
        "student_grading_credit_balance",
        ["student_user_id"],
    )

    op.create_table(
        "homework_grading_payment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
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
        sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["homework_submission.id"]),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "submission_id", name="uq_grading_payment_submission"
        ),
    )
    op.create_index(
        "ix_grading_payment_submission",
        "homework_grading_payment",
        ["submission_id"],
    )
    op.create_index(
        "ix_grading_payment_tutor", "homework_grading_payment", ["tutor_id"]
    )
    op.create_index(
        "ix_grading_payment_student",
        "homework_grading_payment",
        ["student_user_id"],
    )
    op.create_index(
        "ix_grading_payment_checkout",
        "homework_grading_payment",
        ["stripe_checkout_session_id"],
    )
    op.create_index(
        "ix_grading_payment_intent",
        "homework_grading_payment",
        ["stripe_payment_intent_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_grading_payment_intent", table_name="homework_grading_payment")
    op.drop_index("ix_grading_payment_checkout", table_name="homework_grading_payment")
    op.drop_index("ix_grading_payment_student", table_name="homework_grading_payment")
    op.drop_index("ix_grading_payment_tutor", table_name="homework_grading_payment")
    op.drop_index("ix_grading_payment_submission", table_name="homework_grading_payment")
    op.drop_table("homework_grading_payment")
    op.drop_index("ix_grading_credit_student", table_name="student_grading_credit_balance")
    op.drop_index("ix_grading_credit_tutor", table_name="student_grading_credit_balance")
    op.drop_table("student_grading_credit_balance")
    op.drop_index("ix_homework_submission_grading_paid", table_name="homework_submission")
    with op.batch_alter_table("homework_submission") as batch:
        batch.drop_column("grading_paid")
    with op.batch_alter_table("homework_assignment") as batch:
        batch.drop_column("grading_currency")
        batch.drop_column("grading_price_cents")
    with op.batch_alter_table("tutor_subscription_plan") as batch:
        batch.drop_column("credits_roll_over")
        batch.drop_column("monthly_grading_credits")
    with op.batch_alter_table("homework_template") as batch:
        batch.drop_column("grading_price_cents")
