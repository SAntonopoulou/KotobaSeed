"""Per-article tutor-written preview for subscriber-only content.

Lets a tutor write a deliberate "hook" shown to non-subscribers viewing
a SUBSCRIBERS_ONLY article. When this column is NULL the reader falls
back to first-200-words of body_markdown, so existing rows don't need
a backfill.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260623_article_preview"
down_revision: str | None = "20260622_demo_trial_period"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.add_column(sa.Column("preview_markdown", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.drop_column("preview_markdown")
