"""Phase 4 — badges + group leaderboard event log.

Two new tables:
- skill_badge          — persistent achievements granted on threshold
- group_activity_point — append-only event log for monthly leaderboards
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_badges_leaderboard"
down_revision: str | None = "20260628_group_threads"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "skill_badge",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("languagegroup.id"),
            nullable=True,
        ),
        sa.Column("earned_at", sa.DateTime(), nullable=False),
        sa.Column("counter", sa.Integer(), nullable=True),
        sa.UniqueConstraint(
            "user_id", "kind", "group_id", name="uq_skill_badge_triple"
        ),
    )
    op.create_index("ix_skill_badge_user_id", "skill_badge", ["user_id"])
    op.create_index("ix_skill_badge_kind", "skill_badge", ["kind"])
    op.create_index("ix_skill_badge_group_id", "skill_badge", ["group_id"])

    op.create_table(
        "group_activity_point",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("languagegroup.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("dedupe_key", sa.String(length=80), nullable=True),
    )
    op.create_index(
        "ix_group_activity_point_group_id",
        "group_activity_point",
        ["group_id"],
    )
    op.create_index(
        "ix_group_activity_point_user_id",
        "group_activity_point",
        ["user_id"],
    )
    op.create_index(
        "ix_group_activity_point_year_month",
        "group_activity_point",
        ["year_month"],
    )
    op.create_index(
        "ix_group_activity_point_dedupe_key",
        "group_activity_point",
        ["dedupe_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_group_activity_point_dedupe_key", table_name="group_activity_point"
    )
    op.drop_index(
        "ix_group_activity_point_year_month", table_name="group_activity_point"
    )
    op.drop_index(
        "ix_group_activity_point_user_id", table_name="group_activity_point"
    )
    op.drop_index(
        "ix_group_activity_point_group_id", table_name="group_activity_point"
    )
    op.drop_table("group_activity_point")

    op.drop_index("ix_skill_badge_group_id", table_name="skill_badge")
    op.drop_index("ix_skill_badge_kind", table_name="skill_badge")
    op.drop_index("ix_skill_badge_user_id", table_name="skill_badge")
    op.drop_table("skill_badge")
