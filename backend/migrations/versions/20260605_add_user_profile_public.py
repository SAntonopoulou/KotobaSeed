"""Add User.profile_public for student privacy opt-out.

Defaults to True so existing rows stay visible — opt-out is an explicit
student action. Teachers and tutors are always public regardless of this
flag (their business face), and the /profile/<id> endpoint enforces that
rule.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260605_user_profile_public"
down_revision: str | None = "e55ede2a670a"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column(
                "profile_public",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.drop_column("profile_public")
