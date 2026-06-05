"""Add booking table + BookingStatus enum.

One row per student-buys-a-scheduled-lesson event. References the LessonPack
that was bought (for product attribution) and the Tutor (for ownership +
classroom-minute tracking).
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "20260607_booking"
down_revision: str | None = "20260606_lesson_pack"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "booking",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("lesson_pack_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(length=3), nullable=False),
        sa.Column("platform_fee_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING_PAYMENT",
                "CONFIRMED",
                "COMPLETED",
                "CANCELLED",
                "REFUNDED",
                name="bookingstatus",
            ),
            nullable=False,
        ),
        sa.Column(
            "stripe_checkout_session_id",
            sqlmodel.sql.sqltypes.AutoString(length=128),
            nullable=True,
        ),
        sa.Column(
            "stripe_payment_intent_id",
            sqlmodel.sql.sqltypes.AutoString(length=128),
            nullable=True,
        ),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("refunded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["lesson_pack_id"], ["lesson_pack.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_booking_tutor_id", "booking", ["tutor_id"])
    op.create_index("ix_booking_student_user_id", "booking", ["student_user_id"])
    op.create_index("ix_booking_lesson_pack_id", "booking", ["lesson_pack_id"])
    op.create_index("ix_booking_scheduled_at", "booking", ["scheduled_at"])
    op.create_index("ix_booking_status", "booking", ["status"])
    op.create_index(
        "ix_booking_stripe_checkout_session_id",
        "booking",
        ["stripe_checkout_session_id"],
    )
    op.create_index(
        "ix_booking_stripe_payment_intent_id",
        "booking",
        ["stripe_payment_intent_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_booking_stripe_payment_intent_id", table_name="booking")
    op.drop_index("ix_booking_stripe_checkout_session_id", table_name="booking")
    op.drop_index("ix_booking_status", table_name="booking")
    op.drop_index("ix_booking_scheduled_at", table_name="booking")
    op.drop_index("ix_booking_lesson_pack_id", table_name="booking")
    op.drop_index("ix_booking_student_user_id", table_name="booking")
    op.drop_index("ix_booking_tutor_id", table_name="booking")
    op.drop_table("booking")
    sa.Enum(name="bookingstatus").drop(op.get_bind(), checkfirst=False)
