"""Add `is_default_single` flag to lesson_pack.

The tutor's headline single-lesson price has its own dashboard widget so
the common case ("I charge €25 for a 60-minute lesson") stays a two-field
form. The flag marks which pack that widget edits. The public tutor site
still renders this pack alongside any other num_lessons=1 packs in the
"single lessons" section — inline when there's exactly one, boxes when
the tutor has added extra single-lesson variants via LessonPackManager.

Default False; only set via the new /tutor/single-lesson endpoint. No
backfill needed — existing packs all stay editable through the regular
LessonPackManager flow until the tutor sets up a headline single-lesson
through the new widget.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260609_lesson_pack_default_single"
down_revision: str | None = "20260609_availability_allow_trial"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("lesson_pack") as batch:
        batch.add_column(
            sa.Column(
                "is_default_single",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    op.create_index(
        "ix_lesson_pack_is_default_single",
        "lesson_pack",
        ["is_default_single"],
    )


def downgrade() -> None:
    op.drop_index("ix_lesson_pack_is_default_single", table_name="lesson_pack")
    with op.batch_alter_table("lesson_pack") as batch:
        batch.drop_column("is_default_single")
