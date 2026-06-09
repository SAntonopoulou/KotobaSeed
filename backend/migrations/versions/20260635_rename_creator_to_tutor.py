"""Rename UserRole.CREATOR → UserRole.TUTOR.

Final naming pass: every user who teaches or sells content is a "Tutor".
The student persona is unchanged. CREATOR was internal jargon that confused
the UI ("Tutor" was used in user-facing copy already).

Two steps:
  1) Add 'TUTOR' to the Postgres `userrole` enum type. This must run in
     its own transaction because Postgres ALTER TYPE ADD VALUE cannot run
     inside a transaction block.
  2) UPDATE every row whose role is 'CREATOR' (or the lowercase 'creator'
     variant from historical seed scripts) to 'TUTOR'.

We deliberately do NOT drop the old 'CREATOR' enum value from the Postgres
type — Postgres can't remove enum values cleanly without recreating the
type, and an unused enum value is harmless.
"""

from __future__ import annotations

from alembic import op

revision: str = "20260635_creator_to_tutor"
down_revision: str | None = "20260633_custom_theme_v2"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Step 1 — extend the enum TYPE. Must be in its own transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'TUTOR'")

    # Step 2 — migrate existing rows. "user" is a reserved keyword in
    # Postgres so the table name must be quoted. We cast `role` to text on
    # the comparison side so that the literal string can be 'creator' or
    # 'CREATOR' regardless of whether the lowercase value happens to exist
    # in the enum on this database. (Some databases only ever stored the
    # uppercase enum name; pre-existing lowercase rows are not guaranteed
    # to exist, and comparing to an enum literal that isn't in the type
    # would raise InvalidTextRepresentation.)
    op.execute(
        'UPDATE "user" SET role = \'TUTOR\'::userrole '
        "WHERE role::text = 'CREATOR' OR role::text = 'creator'"
    )


def downgrade() -> None:
    # CREATOR is still a valid value in the enum (we never removed it).
    op.execute(
        'UPDATE "user" SET role = \'CREATOR\'::userrole '
        "WHERE role::text = 'TUTOR' OR role::text = 'tutor'"
    )
