"""Add Tutor.active_theme_id, Booking.tutor_team_id, TutorTeam.poaching_protection_days,
and the tutor_protected_student table.

These columns + table support the school non-compete: when a tutor leaves
a team we stamp a TutorProtectedStudent row for every student who booked
with them while in the team. Booking checkout for the ex-tutor blocks
those students until protection_ends_at.

Idempotent: each piece is added only if it doesn't already exist (fresh
SQLModel-created DBs vs. existing dev DBs).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260615_team_protection"
down_revision: str | None = "20260614_tutor_teams"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    inspector = sa.inspect(conn)

    # --- Tutor.active_theme_id -----------------------------------------
    tutor_cols = {c["name"] for c in inspector.get_columns("tutor")}
    if "active_theme_id" not in tutor_cols:
        if dialect == "postgresql":
            op.execute(
                "ALTER TABLE tutor ADD COLUMN IF NOT EXISTS active_theme_id INTEGER"
            )
        else:
            with op.batch_alter_table("tutor") as batch:
                batch.add_column(sa.Column("active_theme_id", sa.Integer(), nullable=True))
        op.create_index("ix_tutor_active_theme_id", "tutor", ["active_theme_id"])

    # --- Booking.tutor_team_id ----------------------------------------
    booking_cols = {c["name"] for c in inspector.get_columns("booking")}
    if "tutor_team_id" not in booking_cols:
        if dialect == "postgresql":
            op.execute(
                "ALTER TABLE booking ADD COLUMN IF NOT EXISTS tutor_team_id INTEGER "
                "REFERENCES tutor_team(id)"
            )
        else:
            with op.batch_alter_table("booking") as batch:
                batch.add_column(sa.Column("tutor_team_id", sa.Integer(), nullable=True))
                batch.create_foreign_key(
                    "fk_booking_tutor_team_id",
                    "tutor_team",
                    ["tutor_team_id"],
                    ["id"],
                )
        op.create_index("ix_booking_tutor_team_id", "booking", ["tutor_team_id"])

    # --- TutorTeam.poaching_protection_days ---------------------------
    team_cols = {c["name"] for c in inspector.get_columns("tutor_team")}
    if "poaching_protection_days" not in team_cols:
        if dialect == "postgresql":
            op.execute(
                "ALTER TABLE tutor_team "
                "ADD COLUMN IF NOT EXISTS poaching_protection_days INTEGER "
                "NOT NULL DEFAULT 90"
            )
        else:
            with op.batch_alter_table("tutor_team") as batch:
                batch.add_column(
                    sa.Column(
                        "poaching_protection_days",
                        sa.Integer(),
                        nullable=False,
                        server_default="90",
                    )
                )

    # --- tutor_protected_student table --------------------------------
    if "tutor_protected_student" not in set(inspector.get_table_names()):
        op.create_table(
            "tutor_protected_student",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tutor_id", sa.Integer(), nullable=False),
            sa.Column("student_user_id", sa.Integer(), nullable=False),
            sa.Column("former_team_id", sa.Integer(), nullable=False),
            sa.Column("protection_ends_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
            sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["former_team_id"], ["tutor_team.id"]),
        )
        op.create_index(
            "ix_tutor_protected_student_tutor_id",
            "tutor_protected_student",
            ["tutor_id"],
        )
        op.create_index(
            "ix_tutor_protected_student_student_user_id",
            "tutor_protected_student",
            ["student_user_id"],
        )
        op.create_index(
            "ix_tutor_protected_student_former_team_id",
            "tutor_protected_student",
            ["former_team_id"],
        )
        op.create_index(
            "ix_tutor_protected_student_protection_ends_at",
            "tutor_protected_student",
            ["protection_ends_at"],
        )


def downgrade() -> None:
    import contextlib

    with contextlib.suppress(Exception):
        op.drop_table("tutor_protected_student")
    with op.batch_alter_table("tutor_team") as batch:
        with contextlib.suppress(Exception):
            batch.drop_column("poaching_protection_days")
    with op.batch_alter_table("booking") as batch:
        with contextlib.suppress(Exception):
            batch.drop_constraint("fk_booking_tutor_team_id", type_="foreignkey")
        with contextlib.suppress(Exception):
            batch.drop_column("tutor_team_id")
    with op.batch_alter_table("tutor") as batch:
        with contextlib.suppress(Exception):
            batch.drop_column("active_theme_id")
