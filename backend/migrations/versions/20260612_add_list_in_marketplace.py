"""Add `list_in_marketplace` flag to tutor.

Default True so existing + new tutors show up in the apex /library
directory automatically. Tutors who want subdomain-only traffic can opt
out from the dashboard.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260612_list_in_marketplace"
down_revision: str | None = "20260611_custom_domain_verified_at"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column(
                "list_in_marketplace",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
    op.create_index(
        "ix_tutor_list_in_marketplace", "tutor", ["list_in_marketplace"]
    )


def downgrade() -> None:
    op.drop_index("ix_tutor_list_in_marketplace", table_name="tutor")
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("list_in_marketplace")
