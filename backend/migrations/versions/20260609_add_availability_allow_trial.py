"""Add `allow_trial` flag to tutor_availability.

Trial windows are a SUPERSET overlay on regular availability — never carve
out from paid bookings. The flag marks a window as additionally bookable
for trials. Default is False; the `book_trial` endpoint filters slot
computation to windows where allow_trial=True.

Backfill: for tutors who already opted into trials (offers_free_trial=True),
set allow_trial=True on every existing window. This preserves today's
behavior (trials allowed in any window) until they choose otherwise.
Tutors who add new windows after this migration get allow_trial=False by
default — explicit opt-in per window.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260609_availability_allow_trial"
down_revision: str | None = "20260608_free_trial"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor_availability") as batch:
        batch.add_column(
            sa.Column(
                "allow_trial",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    # Backfill — keep existing tutors' trial behavior unchanged: anyone who
    # opted into trials before today gets all their existing windows flagged
    # trial-eligible. They can then carve out paid-only peak hours by
    # editing the grid.
    op.execute(
        """
        UPDATE tutor_availability
           SET allow_trial = 1
         WHERE tutor_id IN (
             SELECT id FROM tutor WHERE offers_free_trial = 1
         )
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("tutor_availability") as batch:
        batch.drop_column("allow_trial")
