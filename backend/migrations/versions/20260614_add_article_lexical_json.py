"""Add `lexical_json` column to article.

Mirrors Vasso's storage pattern: editor saves both markdown_source (round-
trippable edits) and lexical_json (fast reader path). Nullable so older
articles created before this migration still load — the reader falls back
to body_markdown when lexical_json is empty.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260614_article_lexical_json"
down_revision: str | None = "20260614_article"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.add_column(sa.Column("lexical_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("article") as batch:
        batch.drop_column("lexical_json")
