#!/usr/bin/env python3
"""Push the apex signed-out chrome to the BeeRanked /news plugin.

Reads the single source of truth at
    frontend/src/components/apex_chrome.signed_out.html
splits it into the <nav> and <footer> blocks, and calls
upsert_plugin on the BeeRanked MCP endpoint so the /news plugin
slots match the apex.

Bearer key is read from `/home/sophia/beerankedbullshit.bullshit`
by default (the same file the MCP install command used). Override
with the BEERANKED_KEY env var if needed.

Run after every edit to apex_chrome.signed_out.html:
    python3 scripts/sync_news_chrome.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = REPO_ROOT / "frontend/src/components/apex_chrome.signed_out.html"

BRAND_ID = "gz7fvcg732n1odrgvl6qwr6s"  # from list_brands; "My Brand" → renamed in Studio
PLUGIN_NAME = "kotobaseed-apex-chrome"
MCP_URL = "https://studio.beeranked.online/api/mcp"

# Stable apex CSS bundle copied by scripts/copy_apex_chrome_assets.sh
# after every frontend rebuild — keeps the BeeRanked plugin pointed at
# the same compiled Tailwind output as the apex SPA.
HEAD_HTML = """\
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://kotobaseed.net/branding/apex.css">"""

# Minimal — just hide BeeRanked's defaults and set the body font/bg so
# they match the apex. Everything else comes from apex.css.
CUSTOM_CSS = """\
.site-nav, nav.site-nav,
.site-footer, footer.site-footer,
.nav-inner, .footer-inner { display: none !important; }

body {
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
  background: rgb(244 241 233);
  color: rgb(43 70 60);
}

.kb-mobile-drawer { display: none; }
.kb-mob-open .kb-mobile-drawer { display: block; }
@media (min-width: 1024px) { .kb-mob-open .kb-mobile-drawer { display: none; } }
"""


def read_key() -> str:
    env = os.environ.get("BEERANKED_KEY")
    if env:
        return env.strip()
    p = Path("/home/sophia/beerankedbullshit.bullshit")
    if p.exists():
        return p.read_text().strip()
    raise SystemExit(
        "BeeRanked key not found. Set BEERANKED_KEY or drop the key file at "
        "/home/sophia/beerankedbullshit.bullshit."
    )


def split_template(html: str) -> tuple[str, str]:
    nav_match = re.search(r'<nav class="bg-white[\s\S]*?</nav>', html)
    footer_match = re.search(r'<footer class="bg-white[\s\S]*?</footer>', html)
    if not nav_match:
        raise SystemExit("Could not find <nav class=\"bg-white...\"> block in template.")
    if not footer_match:
        raise SystemExit("Could not find <footer class=\"bg-white...\"> block in template.")
    return nav_match.group(0), footer_match.group(0)


def call_mcp(method: str, params: dict, key: str) -> dict:
    payload = json.dumps(
        {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    ).encode("utf-8")
    req = urllib.request.Request(
        MCP_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {key}",
            # urllib's default User-Agent (Python-urllib/3.X) gets a 403
            # from the MCP edge. Use a plain UA the way curl does.
            "User-Agent": "kotobaseed-news-chrome-sync/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    # The MCP may stream as SSE; pull out the first data: line if so.
    if raw.startswith("event:") or "\ndata:" in raw or raw.startswith("data:"):
        for line in raw.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
    return json.loads(raw)


def main() -> int:
    if not TEMPLATE_PATH.exists():
        print(f"FAIL: template not found at {TEMPLATE_PATH}", file=sys.stderr)
        return 1
    html = TEMPLATE_PATH.read_text()
    nav_html, footer_html = split_template(html)
    key = read_key()

    print(f"Pushing chrome → BeeRanked plugin '{PLUGIN_NAME}'…")
    print(f"  banner: {len(nav_html)} bytes")
    print(f"  footer: {len(footer_html)} bytes")

    result = call_mcp(
        "tools/call",
        {
            "name": "upsert_plugin",
            "arguments": {
                "brand_id": BRAND_ID,
                "name": PLUGIN_NAME,
                "enabled": True,
                "head_html": HEAD_HTML,
                "slots": {"banner": nav_html, "footer": footer_html},
                "custom_css": CUSTOM_CSS,
            },
        },
        key,
    )
    print(json.dumps(result, indent=2))
    if "error" in result:
        return 1
    print(
        "OK. BeeRanked will republish; allow ~30–90 s for the agent to pull "
        "the new chrome (BEERANKED_INTERVAL=60 on prod)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
