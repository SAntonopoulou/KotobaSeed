"""Add `reminder_sent_at` to booking for 24h reminder dedup.

Hourly sweep stamps this when it sends the reminder email, so a worker
restart or schedule overlap can't fire two reminders for the same booking.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260610_booking_reminder_sent_at"
down_revision: str | None = "20260609_lesson_pack_default_single"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("booking") as batch:
        batch.add_column(
            sa.Column("reminder_sent_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("booking") as batch:
        batch.drop_column("reminder_sent_at")
