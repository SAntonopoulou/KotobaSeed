"""Phase 3 — group threads + replies.

Members-only async Q&A inside a LanguageGroup. Threads denorm
reply_count + last_reply_at so the index sort stays cheap.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260628_group_threads"
down_revision: str | None = "20260627_cohorts"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "group_thread",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("languagegroup.id"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body_markdown", sa.String(length=8000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_reply_at", sa.DateTime(), nullable=False),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("hidden_at", sa.DateTime(), nullable=True),
        sa.Column(
            "hidden_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_group_thread_group_id", "group_thread", ["group_id"])
    op.create_index(
        "ix_group_thread_author_user_id", "group_thread", ["author_user_id"]
    )
    op.create_index(
        "ix_group_thread_last_reply_at", "group_thread", ["last_reply_at"]
    )

    op.create_table(
        "group_thread_reply",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "thread_id",
            sa.Integer(),
            sa.ForeignKey("group_thread.id"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("body_markdown", sa.String(length=4000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("hidden_at", sa.DateTime(), nullable=True),
        sa.Column(
            "hidden_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_group_thread_reply_thread_id", "group_thread_reply", ["thread_id"]
    )
    op.create_index(
        "ix_group_thread_reply_author_user_id",
        "group_thread_reply",
        ["author_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_group_thread_reply_author_user_id", table_name="group_thread_reply"
    )
    op.drop_index(
        "ix_group_thread_reply_thread_id", table_name="group_thread_reply"
    )
    op.drop_table("group_thread_reply")
    op.drop_index("ix_group_thread_last_reply_at", table_name="group_thread")
    op.drop_index("ix_group_thread_author_user_id", table_name="group_thread")
    op.drop_index("ix_group_thread_group_id", table_name="group_thread")
    op.drop_table("group_thread")
