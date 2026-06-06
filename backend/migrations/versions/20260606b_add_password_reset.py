"""Add password reset token fields to User.

Two columns mirroring the email_verification_* pair: a hashed opaque
token and an expiry. We hash the token at rest so a DB compromise can't
be replayed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260606b_password_reset"
down_revision: str | None = "20260606_tutor_theme"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column("password_reset_token_hash", sa.String(length=255), nullable=True)
        )
        batch.add_column(
            sa.Column("password_reset_expires_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.drop_column("password_reset_expires_at")
        batch.drop_column("password_reset_token_hash")
