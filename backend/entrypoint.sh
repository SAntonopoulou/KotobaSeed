#!/usr/bin/env bash
# Kotobaseed backend startup orchestrator.
#
# Boot sequence:
#   1. Bootstrap any missing tables via SQLModel.metadata.create_all().
#      Safe on existing DBs (idempotent).
#   2. Reconcile Alembic state:
#      - If alembic_version table exists → just `alembic upgrade head`.
#      - Else if app tables already exist (pre-Alembic install) →
#        `alembic stamp head`, then upgrade.
#      - Else (truly fresh DB) → upgrade applies every migration from base.
#   3. Apply pending Alembic migrations.
#   4. Hand off to uvicorn.

set -euo pipefail

# Step 1: ensure tables exist via SQLModel.metadata.create_all()
python -c "from backend.database import create_db_and_tables; create_db_and_tables()"

# Step 2: stamp existing pre-Alembic databases so step 3 doesn't try to
# create tables that already exist.
python <<'PY'
import subprocess

from sqlalchemy import inspect

from backend.database import engine

with engine.connect() as conn:
    insp = inspect(conn)
    names = set(insp.get_table_names())

has_alembic = "alembic_version" in names
has_app_tables = "user" in names

if not has_alembic and has_app_tables:
    print("[entrypoint] Stamping existing DB to alembic head (pre-migration bootstrap)")
    subprocess.run(["alembic", "stamp", "head"], check=True, cwd="backend")
PY

# Step 3: apply pending migrations
cd backend
alembic upgrade head
cd ..

# Step 4: hand off to uvicorn
exec uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers "${UVICORN_WORKERS:-2}"
