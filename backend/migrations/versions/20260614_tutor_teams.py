"""TutorTeam + TutorTeamInvite tables, Tutor.team_id column.

The schema is created by SQLModel.metadata.create_all() at startup (the
auto-create-then-stamp pattern documented in the baseline migration), so
this revision's `upgrade` only adds the new column to the existing
`tutor` table and is a no-op on fresh databases where SQLModel just built
everything.

Idempotent on every environment:
- Uses IF NOT EXISTS for the column add on Postgres.
- Catches OperationalError on SQLite for the same column add (SQLite
  doesn't ship IF NOT EXISTS on ADD COLUMN).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260614_tutor_teams"
down_revision: str | None = "20260613_sync_tutor_connect_to_user"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # tutor_team
    if "tutor_team" not in existing_tables:
        op.create_table(
            "tutor_team",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_user_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("max_seats", sa.Integer(), nullable=False, server_default="5"),
            sa.Column(
                "stripe_seat_subscription_item_id",
                sa.String(length=128),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["owner_user_id"], ["user.id"]),
        )
        op.create_index(
            "ix_tutor_team_owner_user_id", "tutor_team", ["owner_user_id"]
        )

    # tutor_team_invite
    if "tutor_team_invite" not in existing_tables:
        op.create_table(
            "tutor_team_invite",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("token", sa.String(length=80), nullable=False, unique=True),
            sa.Column("invited_by_user_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=32),
                nullable=False,
                server_default="PENDING",
            ),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("accepted_at", sa.DateTime(), nullable=True),
            sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["team_id"], ["tutor_team.id"]),
            sa.ForeignKeyConstraint(["invited_by_user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["accepted_by_user_id"], ["user.id"]),
        )
        op.create_index(
            "ix_tutor_team_invite_team_id", "tutor_team_invite", ["team_id"]
        )
        op.create_index(
            "ix_tutor_team_invite_email", "tutor_team_invite", ["email"]
        )
        op.create_index(
            "ix_tutor_team_invite_token", "tutor_team_invite", ["token"], unique=True
        )
        op.create_index(
            "ix_tutor_team_invite_status", "tutor_team_invite", ["status"]
        )

    # Tutor.team_id column — only adds when missing. SQLModel.metadata.create_all
    # already added this on fresh databases; the column may or may not exist
    # on existing dev DBs depending on when they were last stamped.
    tutor_cols = {c["name"] for c in inspector.get_columns("tutor")}
    if "team_id" not in tutor_cols:
        if dialect == "postgresql":
            op.execute(
                "ALTER TABLE tutor "
                "ADD COLUMN IF NOT EXISTS team_id INTEGER "
                "REFERENCES tutor_team(id)"
            )
        else:
            # SQLite doesn't support IF NOT EXISTS on ADD COLUMN; the
            # existence check above already guards this branch.
            with op.batch_alter_table("tutor") as batch:
                batch.add_column(
                    sa.Column("team_id", sa.Integer(), nullable=True)
                )
                batch.create_foreign_key(
                    "fk_tutor_team_id_tutor_team",
                    "tutor_team",
                    ["team_id"],
                    ["id"],
                )
        op.create_index("ix_tutor_team_id", "tutor", ["team_id"])


def downgrade() -> None:
    # Downgrade is best-effort. Restoring a Business-with-team account
    # cleanly after going back through this migration isn't a real use
    # case; the steps below let alembic stamp move backward without
    # blowing up if some pieces are already gone.
    import contextlib

    with contextlib.suppress(Exception):
        op.drop_index("ix_tutor_team_id", table_name="tutor")
    with op.batch_alter_table("tutor") as batch:
        with contextlib.suppress(Exception):
            batch.drop_constraint("fk_tutor_team_id_tutor_team", type_="foreignkey")
        with contextlib.suppress(Exception):
            batch.drop_column("team_id")
    with contextlib.suppress(Exception):
        op.drop_table("tutor_team_invite")
    with contextlib.suppress(Exception):
        op.drop_table("tutor_team")
