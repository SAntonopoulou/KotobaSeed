#!/usr/bin/env bash
# Copy the latest built apex CSS bundle to the stable /branding path
# so the BeeRanked plugin (and any other static integration) can
# reference the same Tailwind output as the React SPA without
# tracking the Vite hash.
#
# Run on the prod (or staging) host after a frontend rebuild:
#   bash scripts/copy_apex_chrome_assets.sh
#
# Or wire into the deploy step / GitHub Action so it runs whenever
# the frontend container changes.

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/kotobaseed}"
BRANDING_DIR="${BRANDING_DIR:-$COMPOSE_DIR/branding}"

cd "$COMPOSE_DIR"

CSS=$(docker compose exec -T frontend ls /usr/share/nginx/html/assets/ \
        | grep -E '^index-[a-z0-9]+\.css$' | head -1 | tr -d '\r')

if [ -z "$CSS" ]; then
  echo "ERROR: no apex CSS bundle found in frontend container" >&2
  exit 1
fi

echo "Copying $CSS → $BRANDING_DIR/apex.css"
docker compose exec -T frontend cat "/usr/share/nginx/html/assets/$CSS" \
  > "$BRANDING_DIR/apex.css"

# Caddy serves /branding/* read-only via the existing mount, so the
# new file is live immediately — no Caddy reload needed.
echo "Done. /branding/apex.css size: $(stat -c %s "$BRANDING_DIR/apex.css") bytes."
