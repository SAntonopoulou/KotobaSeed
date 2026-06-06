"""Support ticket system — tickets + messages."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260606d_support_tickets"
down_revision: str | None = "20260606c_platform_setting"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "support_ticket",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("submitted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("submitted_by_email", sa.String(length=255), nullable=False),
        sa.Column("submitted_by_name", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("escalation_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("related_user_id", sa.Integer(), nullable=True),
        sa.Column("related_booking_id", sa.Integer(), nullable=True),
        sa.Column("related_tutor_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["related_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["related_booking_id"], ["booking.id"]),
        sa.ForeignKeyConstraint(["related_tutor_id"], ["tutor.id"]),
    )
    op.create_index("ix_support_ticket_status", "support_ticket", ["status"])
    op.create_index("ix_support_ticket_priority", "support_ticket", ["priority"])
    op.create_index("ix_support_ticket_category", "support_ticket", ["category"])
    op.create_index("ix_support_ticket_created_at", "support_ticket", ["created_at"])
    op.create_index(
        "ix_support_ticket_last_activity_at", "support_ticket", ["last_activity_at"]
    )
    op.create_index(
        "ix_support_ticket_submitted_by_user_id",
        "support_ticket",
        ["submitted_by_user_id"],
    )

    op.create_table(
        "support_ticket_message",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("author_label", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_ticket.id"]),
        sa.ForeignKeyConstraint(["author_user_id"], ["user.id"]),
    )
    op.create_index(
        "ix_support_ticket_message_ticket_id",
        "support_ticket_message",
        ["ticket_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_support_ticket_message_ticket_id", table_name="support_ticket_message")
    op.drop_table("support_ticket_message")
    op.drop_index("ix_support_ticket_submitted_by_user_id", table_name="support_ticket")
    op.drop_index("ix_support_ticket_last_activity_at", table_name="support_ticket")
    op.drop_index("ix_support_ticket_created_at", table_name="support_ticket")
    op.drop_index("ix_support_ticket_category", table_name="support_ticket")
    op.drop_index("ix_support_ticket_priority", table_name="support_ticket")
    op.drop_index("ix_support_ticket_status", table_name="support_ticket")
    op.drop_table("support_ticket")
