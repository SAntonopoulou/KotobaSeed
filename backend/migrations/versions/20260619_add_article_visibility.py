"""Add `visibility` column to article.

Three modes: public (default, current behavior), subscribers_only (hidden
from public list, gated to subscribers), module_only (hidden + only
reachable via paid module). Existing rows default to public so nothing
changes for already-published articles.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_article_visibility"
down_revision: str | None = "20260619_tutor_subscriptions"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.add_column(
            sa.Column(
                "visibility",
                sa.String(length=20),
                nullable=False,
                server_default="public",
            )
        )
    op.create_index("ix_article_visibility", "article", ["visibility"])


def downgrade() -> None:
    op.drop_index("ix_article_visibility", table_name="article")
    with op.batch_alter_table("article") as batch:
        batch.drop_column("visibility")
