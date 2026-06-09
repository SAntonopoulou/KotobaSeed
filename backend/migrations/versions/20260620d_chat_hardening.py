"""Chat hardening: undo-send, attachments, reports, user blocks.

- ``message.deleted_at`` carries the 60-second undo-send timestamp.
- ``message.attachment_url`` / ``attachment_kind`` carry a single image
  attachment per message (first-pass attachments scope).
- ``conversation_report`` is the moderation queue surface that admins
  pick from at /admin/reports.
- ``user_block`` is a symmetric block table — either side can muzzle the
  other; chat sends refuse when a block is in place.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620d_chat_hardening"
down_revision: str | None = "20260620c_conv_initial_gate"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("message") as batch:
        batch.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("attachment_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("attachment_kind", sa.String(length=20), nullable=True))

    with op.batch_alter_table("group_session") as batch:
        batch.add_column(sa.Column("delivered_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_group_session_delivered_at",
        "group_session",
        ["delivered_at"],
    )

    op.create_table(
        "conversation_report",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversation.id"), nullable=False, index=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("message.id"), nullable=True),
        sa.Column("reporter_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("reported_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("resolved_by_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("resolution_note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "user_block",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("blocker_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("blocked_user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_block_pair"),
    )


def downgrade() -> None:
    op.drop_table("user_block")
    op.drop_table("conversation_report")
    op.drop_index("ix_group_session_delivered_at", table_name="group_session")
    with op.batch_alter_table("group_session") as batch:
        batch.drop_column("delivered_at")
    with op.batch_alter_table("message") as batch:
        batch.drop_column("attachment_kind")
        batch.drop_column("attachment_url")
        batch.drop_column("deleted_at")
