#!/usr/bin/env bash
# Start the Kotobaseed backend for Playwright tests.
#
# Usage:
#   ./frontend/tests/e2e/start-backend.sh
#
# Runs uvicorn against a hermetic SQLite DB at /tmp/koto-playwright.db,
# with Stripe + Resend stubbed (ENVIRONMENT=test short-circuits the
# Stripe Connect calls). Port 8765 by default; override with
# `PLAYWRIGHT_BACKEND_PORT=8800 ./start-backend.sh`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

if [ -d .venv ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
fi

PORT="${PLAYWRIGHT_BACKEND_PORT:-8765}"
DB_PATH="${PLAYWRIGHT_BACKEND_DB:-/tmp/koto-playwright.db}"

rm -f "$DB_PATH" "$DB_PATH-shm" "$DB_PATH-wal"

export DATABASE_URL="sqlite:///$DB_PATH"
export ENVIRONMENT="test"
export SECRET_KEY="playwright-test-secret-not-prod"
export CORS_ORIGINS="http://localhost:5174"
export AUTH_COOKIE_DOMAIN=""
export AUTH_COOKIE_SECURE="false"
export STRIPE_SECRET_KEY="sk_test_placeholder"
export STRIPE_WEBHOOK_SECRET="whsec_placeholder"
export RESEND_API_KEY=""
export ACCESS_TOKEN_EXPIRE_MINUTES="60"
export SCHEDULER_ENABLED="false"

echo "[start-backend] DATABASE_URL=$DATABASE_URL port=$PORT"
exec python -u -m uvicorn backend.main:app --host 127.0.0.1 --port "$PORT"
