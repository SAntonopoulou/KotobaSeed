"""Demo classroom trial fields on User.

Admins hand-issue these for sales / partner demos. Hard cap on
classroom minutes; auto-expiry after 7 days so forgotten trials clean
up themselves.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620f_demo_trial"
down_revision: str | None = "20260620e_maintenance_credit"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(sa.Column("is_demo_trial", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("demo_trial_minutes_remaining", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("demo_trial_expires_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("demo_trial_label", sa.String(length=120), nullable=True))
        batch.add_column(
            sa.Column("demo_trial_created_by_admin_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True)
        )
    op.create_index("ix_user_is_demo_trial", "user", ["is_demo_trial"])
    op.create_index("ix_user_demo_trial_expires_at", "user", ["demo_trial_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_user_demo_trial_expires_at", table_name="user")
    op.drop_index("ix_user_is_demo_trial", table_name="user")
    with op.batch_alter_table("user") as batch:
        batch.drop_column("demo_trial_created_by_admin_id")
        batch.drop_column("demo_trial_label")
        batch.drop_column("demo_trial_expires_at")
        batch.drop_column("demo_trial_minutes_remaining")
        batch.drop_column("is_demo_trial")
