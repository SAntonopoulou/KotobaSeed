#!/usr/bin/env bash
# Kotobaseed backend startup orchestrator.
#
# Boot sequence:
#   1. Wait for Postgres to accept connections when DATABASE_URL points
#      at one (a no-op on sqlite local dev).
#   2. Bootstrap any missing tables via SQLModel.metadata.create_all() in
#      dev only — production must NEVER auto-create because alembic is
#      the single source of truth (drift is silent and miserable).
#   3. Reconcile Alembic state:
#      - alembic_version table exists → just `alembic upgrade head`.
#      - app tables already exist (pre-Alembic install) →
#        `alembic stamp head`, then upgrade.
#      - truly fresh DB → upgrade applies every migration from base.
#   4. Apply pending Alembic migrations.
#   5. Hand off to uvicorn.

set -euo pipefail

# Resolve the directory the backend package lives in so we work both
# from the host repo (./backend/entrypoint.sh) and inside the container
# (/app/entrypoint.sh where backend is /app/backend).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
case "$SCRIPT_DIR" in
  */backend) APP_ROOT="$(dirname "$SCRIPT_DIR")" ;;  # ./backend → repo root
  *) APP_ROOT="$SCRIPT_DIR" ;;                       # /app entrypoint
esac
cd "$APP_ROOT"

# Step 1: wait for Postgres when applicable.
if echo "${DATABASE_URL:-}" | grep -q "^postgres"; then
  HOSTPORT=$(echo "$DATABASE_URL" | sed -E 's#^postgres(ql)?(\+[a-z0-9]+)?://[^@]+@([^/?]+).*#\3#')
  PG_HOST=$(echo "$HOSTPORT" | cut -d: -f1)
  PG_PORT=$(echo "$HOSTPORT" | cut -s -d: -f2)
  PG_PORT=${PG_PORT:-5432}
  echo "[entrypoint] Waiting for Postgres at ${PG_HOST}:${PG_PORT}..."
  for i in $(seq 1 60); do
    if pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; then
      echo "[entrypoint] Postgres ready."
      break
    fi
    if [ "$i" = 60 ]; then
      echo "[entrypoint] Postgres still not ready after 60s. Aborting." >&2
      exit 1
    fi
    sleep 1
  done
fi

# Step 2: bootstrap base schema via SQLModel.metadata.create_all().
# Idempotent — only creates missing tables. This is what makes the
# stamp-marker baseline migration work on fresh databases.
python -c "from backend.database import create_db_and_tables; create_db_and_tables()"

# Step 3: stamp existing pre-Alembic databases so step 4 doesn't try to
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

# Step 4: apply pending migrations
cd backend
alembic upgrade head
cd ..

# Step 5: hand off to uvicorn
exec uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers "${UVICORN_WORKERS:-1}" \
    --proxy-headers \
    --forwarded-allow-ips='*'
