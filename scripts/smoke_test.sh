#!/usr/bin/env bash
# Post-deploy smoke test.
#
# Usage:
#   ./scripts/smoke_test.sh https://kotobaseed.net https://api.kotobaseed.net
#
# Runs a handful of unauthenticated probes against a deployed env and
# exits non-zero on any failure. The deploy workflows call this with
# the right base URLs; you can also run it locally to sanity-check a
# server you just SSHed into.
#
# What we check (API host):
#   1. /healthz returns 200 (FastAPI alive)
#   2. /marketplace/tutors returns 200 (DB query path works)
#   3. /auth/me returns 401 without a token (auth middleware alive)
#
# What we check (frontend host):
#   4. / returns 200 (SPA reachable)
#
# These are deliberately shallow — they catch a totally broken deploy,
# not a subtle regression. The Playwright suite is the deep check;
# this is just "did anything obvious crash on boot".

set -euo pipefail

FRONTEND_URL="${1:-}"
API_URL="${2:-}"
if [ -z "$FRONTEND_URL" ] || [ -z "$API_URL" ]; then
  echo "Usage: $0 <frontend-url> <api-url>" >&2
  exit 2
fi
FRONTEND_URL="${FRONTEND_URL%/}"
API_URL="${API_URL%/}"

fail=0
probe_code() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local got
  got=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$url" || true)
  if [ "$got" != "$expected" ]; then
    echo "FAIL  $label  expected $expected got $got  ($url)" >&2
    fail=1
  else
    echo "ok    $label  $got  ($url)"
  fi
}

probe_code "healthz       " "$API_URL/healthz" "200"
probe_code "marketplace   " "$API_URL/marketplace/tutors" "200"
probe_code "auth-required " "$API_URL/auth/me" "401"
probe_code "frontend shell" "$FRONTEND_URL/" "200"

if [ "$fail" -ne 0 ]; then
  echo "Smoke test FAILED" >&2
  exit 1
fi

echo "Smoke test passed."
