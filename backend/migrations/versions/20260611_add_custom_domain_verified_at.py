"""Add `custom_domain_verified_at` to tutor.

The tenancy middleware will only honour custom domains once they're
verified — so we never resolve traffic to a tutor whose CNAME could be
spoofed. Nullable: unverified = NULL, verified = timestamp of the
successful DNS check.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260611_custom_domain_verified_at"
down_revision: str | None = "20260610_booking_reminder_sent_at"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column("custom_domain_verified_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("custom_domain_verified_at")
