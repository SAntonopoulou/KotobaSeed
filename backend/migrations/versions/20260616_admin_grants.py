"""Add admin_grant table for comp/service grants.

Admin-managed bookkeeping for one-off contracts, marketing comps, and
internal testing accounts. The cron in services/admin_grants.py sweeps
time-gated rows daily and auto-flips them to EXPIRED with side-effect
cleanup. SQLModel.metadata.create_all() handles fresh databases; this
file just creates the table on existing ones.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260616_admin_grants"
down_revision: str | None = "20260615_team_protection"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "admin_grant" in set(inspector.get_table_names()):
        return
    op.create_table(
        "admin_grant",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("granted_to_user_id", sa.Integer(), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("previous_tier", sa.String(length=32), nullable=True),
        sa.Column(
            "side_effect_ids_json",
            sa.Text(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["granted_to_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["granted_by_user_id"], ["user.id"]),
    )
    op.create_index("ix_admin_grant_granted_to", "admin_grant", ["granted_to_user_id"])
    op.create_index("ix_admin_grant_kind", "admin_grant", ["kind"])
    op.create_index("ix_admin_grant_status", "admin_grant", ["status"])
    op.create_index("ix_admin_grant_expires_at", "admin_grant", ["expires_at"])


def downgrade() -> None:
    import contextlib

    with contextlib.suppress(Exception):
        op.drop_table("admin_grant")
