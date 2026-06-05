"""baseline — current production schema as of 2026-06-05

Revision ID: 20260605_baseline
Revises:
Create Date: 2026-06-05

This is the stamp-marker migration. The actual schema is bootstrapped by
`create_db_and_tables()` at startup (via `SQLModel.metadata.create_all`)
for backwards compatibility with existing CompInput databases. From here
on, every schema change is a proper Alembic migration.

Deploy behaviour
----------------
`entrypoint.sh` (to be added) will:
  1. Run `create_db_and_tables()` to ensure tables exist (idempotent)
  2. If the DB has no alembic_version row but DOES have CompInput tables,
     `alembic stamp head` to mark it as up-to-date with this baseline
  3. Else `alembic upgrade head` to apply pending migrations
"""

from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision: str = "20260605_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline — no DDL. Schema bootstrapped by create_db_and_tables().
    pass


def downgrade() -> None:
    # No downgrade — this is the baseline.
    pass
