"""Add `min_booking_lead_minutes` to tutor.

Tutor-set minimum gap between "now" and a bookable slot. Default 120
(2 hours) so existing tutors get sane behaviour automatically; they can
relax it (down to 0 = "any time, even 1 minute from now") or tighten it
(up to 43200 minutes = 30 days) from the dashboard.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620a_min_booking_lead"
# Chained off `20260617_custom_themes` — the *actual* DB head before
# this change. The migration tree has a pre-existing branch off
# `20260620_grading_credits` that ends in custom_themes; chaining there
# keeps Alembic's heads count to one.
down_revision: str | None = "20260617_custom_themes"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "min_booking_lead_minutes",
                sa.Integer(),
                nullable=False,
                server_default="120",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("min_booking_lead_minutes")
