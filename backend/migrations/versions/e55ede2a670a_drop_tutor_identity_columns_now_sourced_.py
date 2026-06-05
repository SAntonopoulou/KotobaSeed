"""Drop tutor identity columns — now sourced from User.

Sophia confirmed that bio, profile photo, and languages are a single
identity that lives on User and is shared between the marketplace
profile and the tutor's per-tenant site. The duplicate columns on Tutor
caused a real bug (editing on the marketplace profile didn't show up on
the tutor site).

Dropped:
- tutor.bio              → reach via tutor.user.bio
- tutor.photo_url        → reach via tutor.user.avatar_url
- tutor.languages_taught → reach via tutor.user.languages
- tutor.languages_spoken → no semantic equivalent on User yet; the column
                           was always nullable with no production data.
                           Can re-introduce as User.languages_spoken later
                           if/when we split spoken vs taught.

These columns have no production data — the only existing tutor row
(Sophia's "test" tutor) has all four fields populated either via signup
defaults or NULL. Safe to drop unconditionally.
"""

from __future__ import annotations

from alembic import op

revision: str = "e55ede2a670a"
down_revision: str | None = "b8b82f9e5e61"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("tutor") as batch:
        batch.drop_column("languages_spoken")
        batch.drop_column("languages_taught")
        batch.drop_column("photo_url")
        batch.drop_column("bio")


def downgrade() -> None:
    import sqlmodel
    import sqlalchemy as sa

    with op.batch_alter_table("tutor") as batch:
        batch.add_column(
            sa.Column("bio", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch.add_column(
            sa.Column("photo_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "languages_taught", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            )
        )
        batch.add_column(
            sa.Column(
                "languages_spoken", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            )
        )
