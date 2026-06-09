"""Add Tutor.show_kotobaseed_link.

Defaults to True so every existing tutor gets the cross-promotion link
unless they opt out. Tutors with their own captive audience can flip
the flag from their dashboard settings.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260631_tutor_show_kotobaseed_link"
down_revision: str | None = "20260630_demo_workspace"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "show_kotobaseed_link",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("show_kotobaseed_link")
