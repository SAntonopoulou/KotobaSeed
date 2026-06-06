"""Group lessons + recurring bookings.

Adds LessonPack group fields, GroupSession table, Booking.group_session_id
+ recurring_plan_id, RecurringBookingPlan table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260608_group_and_recurring"
down_revision: str | None = "20260607_drop_tutor_marketplace_profile"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("lesson_pack") as batch:
        batch.add_column(
            sa.Column(
                "is_group", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(sa.Column("max_students", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("min_students", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "group_min_threshold_hours",
                sa.Integer(),
                nullable=False,
                server_default="24",
            )
        )
    op.create_index("ix_lesson_pack_is_group", "lesson_pack", ["is_group"])

    op.create_table(
        "group_session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("lesson_pack_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("threshold_eval_at", sa.DateTime(), nullable=False),
        sa.Column("min_evaluated_at", sa.DateTime(), nullable=True),
        sa.Column(
            "is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("classroom_room_url", sa.String(length=512), nullable=True),
        sa.Column("classroom_room_name", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["lesson_pack_id"], ["lesson_pack.id"]),
    )
    op.create_index("ix_group_session_tutor_id", "group_session", ["tutor_id"])
    op.create_index(
        "ix_group_session_lesson_pack_id", "group_session", ["lesson_pack_id"]
    )
    op.create_index(
        "ix_group_session_scheduled_at", "group_session", ["scheduled_at"]
    )
    op.create_index(
        "ix_group_session_threshold_eval_at",
        "group_session",
        ["threshold_eval_at"],
    )
    op.create_index(
        "ix_group_session_is_cancelled", "group_session", ["is_cancelled"]
    )

    op.create_table(
        "recurring_booking_plan",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("lesson_pack_id", sa.Integer(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "lookahead_weeks",
            sa.Integer(),
            nullable=False,
            server_default="4",
        ),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column(
            "stripe_subscription_id", sa.String(length=128), nullable=True
        ),
        sa.Column("stripe_customer_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["lesson_pack_id"], ["lesson_pack.id"]),
    )
    op.create_index(
        "ix_recurring_plan_tutor_id", "recurring_booking_plan", ["tutor_id"]
    )
    op.create_index(
        "ix_recurring_plan_student_user_id",
        "recurring_booking_plan",
        ["student_user_id"],
    )
    op.create_index(
        "ix_recurring_plan_status", "recurring_booking_plan", ["status"]
    )
    op.create_index(
        "ix_recurring_plan_subscription_id",
        "recurring_booking_plan",
        ["stripe_subscription_id"],
    )
    op.create_index(
        "ix_recurring_plan_start_date",
        "recurring_booking_plan",
        ["start_date"],
    )

    with op.batch_alter_table("booking") as batch:
        batch.add_column(sa.Column("group_session_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("recurring_plan_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_booking_group_session", "group_session", ["group_session_id"], ["id"]
        )
        batch.create_foreign_key(
            "fk_booking_recurring_plan",
            "recurring_booking_plan",
            ["recurring_plan_id"],
            ["id"],
        )
    op.create_index(
        "ix_booking_group_session_id", "booking", ["group_session_id"]
    )
    op.create_index(
        "ix_booking_recurring_plan_id", "booking", ["recurring_plan_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_booking_recurring_plan_id", table_name="booking")
    op.drop_index("ix_booking_group_session_id", table_name="booking")
    with op.batch_alter_table("booking") as batch:
        batch.drop_constraint("fk_booking_recurring_plan", type_="foreignkey")
        batch.drop_constraint("fk_booking_group_session", type_="foreignkey")
        batch.drop_column("recurring_plan_id")
        batch.drop_column("group_session_id")

    op.drop_index("ix_recurring_plan_start_date", table_name="recurring_booking_plan")
    op.drop_index(
        "ix_recurring_plan_subscription_id", table_name="recurring_booking_plan"
    )
    op.drop_index("ix_recurring_plan_status", table_name="recurring_booking_plan")
    op.drop_index(
        "ix_recurring_plan_student_user_id", table_name="recurring_booking_plan"
    )
    op.drop_index("ix_recurring_plan_tutor_id", table_name="recurring_booking_plan")
    op.drop_table("recurring_booking_plan")

    op.drop_index("ix_group_session_is_cancelled", table_name="group_session")
    op.drop_index("ix_group_session_threshold_eval_at", table_name="group_session")
    op.drop_index("ix_group_session_scheduled_at", table_name="group_session")
    op.drop_index("ix_group_session_lesson_pack_id", table_name="group_session")
    op.drop_index("ix_group_session_tutor_id", table_name="group_session")
    op.drop_table("group_session")

    op.drop_index("ix_lesson_pack_is_group", table_name="lesson_pack")
    with op.batch_alter_table("lesson_pack") as batch:
        batch.drop_column("group_min_threshold_hours")
        batch.drop_column("min_students")
        batch.drop_column("max_students")
        batch.drop_column("is_group")
