"""Add email verification + GDPR + is_active to user.

These columns support the Step 3 auth rewrite:
- `is_active` — soft-disable accounts without deleting them
- `timezone` — used for localizing email send-times later
- `newsletter_opt_in` + `gdpr_consent_at` + `gdpr_consent_ip` — GDPR audit trail
- `email_verified_at` + `email_verification_code_hash` + `email_verification_expires_at`
  — 6-digit code flow with the code stored only as a salted hash

Bool columns get `server_default` so existing rows in production DBs (where the
user table was created via `create_db_and_tables()` before this migration ran)
backfill without manual intervention.
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "b8b82f9e5e61"
down_revision: str | None = "70eca5e03450"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )
        batch.add_column(
            sa.Column(
                "timezone",
                sqlmodel.sql.sqltypes.AutoString(length=64),
                nullable=False,
                server_default="UTC",
            )
        )
        batch.add_column(
            sa.Column(
                "newsletter_opt_in",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("gdpr_consent_at", sa.DateTime(), nullable=True))
        batch.add_column(
            sa.Column(
                "gdpr_consent_ip",
                sqlmodel.sql.sqltypes.AutoString(length=64),
                nullable=True,
            )
        )
        batch.add_column(sa.Column("email_verified_at", sa.DateTime(), nullable=True))
        batch.add_column(
            sa.Column(
                "email_verification_code_hash",
                sqlmodel.sql.sqltypes.AutoString(length=255),
                nullable=True,
            )
        )
        batch.add_column(
            sa.Column("email_verification_expires_at", sa.DateTime(), nullable=True)
        )
    op.create_index(op.f("ix_user_is_active"), "user", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_is_active"), table_name="user")
    with op.batch_alter_table("user") as batch:
        batch.drop_column("email_verification_expires_at")
        batch.drop_column("email_verification_code_hash")
        batch.drop_column("email_verified_at")
        batch.drop_column("gdpr_consent_ip")
        batch.drop_column("gdpr_consent_at")
        batch.drop_column("newsletter_opt_in")
        batch.drop_column("timezone")
        batch.drop_column("is_active")
