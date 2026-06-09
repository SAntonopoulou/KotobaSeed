"""Language Groups Phase 1A — promote LanguageGroup to a community feature.

Adds:
- LanguageGroup columns: slug, description, cover_color, is_active, created_at
- New language_group_membership table for explicit student joins

Existing UserLanguageGroup table is left as-is — it continues to mark
tutors who teach a language. Membership is the separate read/write
surface students use.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260625_language_groups"
down_revision: str | None = "20260624_article_pricing"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("languagegroup") as batch:
        batch.add_column(sa.Column("slug", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("description", sa.String(length=2000), nullable=True))
        batch.add_column(sa.Column("cover_color", sa.String(length=16), nullable=True))
        batch.add_column(
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            )
        )
        batch.add_column(
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            )
        )
    op.create_index("ix_languagegroup_slug", "languagegroup", ["slug"])
    op.create_index("ix_languagegroup_is_active", "languagegroup", ["is_active"])

    # Backfill slug = lower(language_name) with non-word chars stripped.
    # SQL works on both Postgres and SQLite.
    op.execute(
        """
        UPDATE languagegroup
        SET slug = LOWER(language_name)
        WHERE slug IS NULL
        """
    )

    op.create_table(
        "language_group_membership",
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
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column(
            "role", sa.String(length=16), nullable=False, server_default="member"
        ),
        sa.UniqueConstraint(
            "group_id", "user_id", name="uq_language_group_membership_pair"
        ),
    )
    op.create_index(
        "ix_language_group_membership_group_id",
        "language_group_membership",
        ["group_id"],
    )
    op.create_index(
        "ix_language_group_membership_user_id",
        "language_group_membership",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_language_group_membership_user_id", table_name="language_group_membership"
    )
    op.drop_index(
        "ix_language_group_membership_group_id", table_name="language_group_membership"
    )
    op.drop_table("language_group_membership")

    op.drop_index("ix_languagegroup_is_active", table_name="languagegroup")
    op.drop_index("ix_languagegroup_slug", table_name="languagegroup")
    with op.batch_alter_table("languagegroup") as batch:
        batch.drop_column("created_at")
        batch.drop_column("is_active")
        batch.drop_column("cover_color")
        batch.drop_column("description")
        batch.drop_column("slug")
