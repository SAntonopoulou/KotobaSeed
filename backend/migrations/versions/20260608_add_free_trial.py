"""Add free-trial columns: Tutor opt-in + LessonPack.is_trial.

Tutor gains `offers_free_trial`, `free_trial_minutes`,
`free_trial_limit_per_student` so the tutor can opt in and set the
parameters of the trial lesson they're offering.

LessonPack gains `is_trial` so we can store the managed trial pack
alongside regular packs without polluting the normal UI listings.

All new columns default to safe non-trial values so existing rows
backfill cleanly under SQLite batch_alter_table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260608_free_trial"
down_revision: str | None = "20260608_booking_daily"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "offers_free_trial",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(
            sa.Column(
                "free_trial_minutes",
                sa.Integer(),
                nullable=False,
                server_default="20",
            )
        )
        batch.add_column(
            sa.Column(
                "free_trial_limit_per_student",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )
    with op.batch_alter_table("lesson_pack") as batch:
        batch.add_column(
            sa.Column(
                "is_trial",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    op.create_index("ix_lesson_pack_is_trial", "lesson_pack", ["is_trial"])


def downgrade() -> None:
    op.drop_index("ix_lesson_pack_is_trial", table_name="lesson_pack")
    with op.batch_alter_table("lesson_pack") as batch:
        batch.drop_column("is_trial")
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("free_trial_limit_per_student")
        batch.drop_column("free_trial_minutes")
        batch.drop_column("offers_free_trial")
