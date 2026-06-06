"""Drop the unused TutorMarketplaceProfile table.

Functionality it once modelled is now served by Tutor.list_in_marketplace
and User intro/sample-video fields.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260607_drop_tutor_marketplace_profile"
down_revision: str | None = "20260606d_support_tickets"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_table("tutor_marketplace_profile")


def downgrade() -> None:
    op.create_table(
        "tutor_marketplace_profile",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False, unique=True),
        sa.Column(
            "marketplace_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("intro_video_url", sa.String(length=2048), nullable=True),
        sa.Column("sample_videos_json", sa.Text(), nullable=True),
        sa.Column("follower_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
    )
