"""Demo-is-the-signup onboarding — User fields.

Adds:
- is_demo_account: bool, default False (indexed for the janitor sweep)
- demo_role: str | None (tutor/creator/student)
- demo_workspace_seeded_at: datetime | None
- demo_seed_ids_json: str, default "{}"
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260630_demo_workspace"
down_revision: str | None = "20260629_badges_leaderboard"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column(
                "is_demo_account",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(
            sa.Column("demo_role", sa.String(length=16), nullable=True)
        )
        batch.add_column(
            sa.Column("demo_workspace_seeded_at", sa.DateTime(), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "demo_seed_ids_json",
                sa.String(length=2000),
                nullable=False,
                server_default="{}",
            )
        )
    op.create_index("ix_user_is_demo_account", "user", ["is_demo_account"])


def downgrade() -> None:
    op.drop_index("ix_user_is_demo_account", table_name="user")
    with op.batch_alter_table("user") as batch:
        batch.drop_column("demo_seed_ids_json")
        batch.drop_column("demo_workspace_seeded_at")
        batch.drop_column("demo_role")
        batch.drop_column("is_demo_account")
