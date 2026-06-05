"""Add daily_room_name + daily_room_url to booking.

Populated lazily on the first /classroom-token call for a booking — we
don't create the Daily room at webhook time so failures over there can't
roll back the payment confirmation.
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "20260608_booking_daily"
down_revision: str | None = "20260608_tutor_availability"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("booking") as batch:
        batch.add_column(
            sa.Column(
                "daily_room_name",
                sqlmodel.sql.sqltypes.AutoString(length=128),
                nullable=True,
            )
        )
        batch.add_column(
            sa.Column(
                "daily_room_url",
                sqlmodel.sql.sqltypes.AutoString(length=512),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("booking") as batch:
        batch.drop_column("daily_room_url")
        batch.drop_column("daily_room_name")
