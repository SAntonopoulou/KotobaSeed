"""Maintenance windows + booking-credit tables.

- ``maintenance_window`` is the admin-scheduled outage record. Drives
  the SPA banner, hard modal, and the Caddy maintenance page.
- ``booking_credit`` is the priority-rebook credit we issue when a
  booking gets caught in a maintenance window (or a tutor cancels
  inside the cutoff). Tutor-scoped, 30-day expiry by default,
  application-fee-free at checkout.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620e_maintenance_credit"
down_revision: str | None = "20260620d_chat_hardening"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "maintenance_window",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scheduled_start_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("message", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="scheduled", index=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("affected_booking_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "booking_credit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("tutor_id", sa.Integer(), sa.ForeignKey("tutor.id"), nullable=False, index=True),
        sa.Column("affected_booking_id", sa.Integer(), sa.ForeignKey("booking.id"), nullable=True, index=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="maintenance"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="available", index=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("used_on_booking_id", sa.Integer(), sa.ForeignKey("booking.id"), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("booking_credit")
    op.drop_table("maintenance_window")
