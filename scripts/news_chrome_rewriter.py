#!/usr/bin/env python3
"""Server-side rewrite of BeeRanked /news static HTML.

We do NOT use BeeRanked's Site Plugin system to skin /news. The plugin
slots inject our HTML INTO BeeRanked's own `<nav class="site-nav">` and
`<footer><div class="footer-inner">` wrappers, which adds padding and
leaves the BeeRanked default chrome visible. Instead, this sidecar
takes the raw HTML the agent writes to disk and surgically replaces
the chrome before Caddy serves it.

Flow:
    BeeRanked agent ──writes──► /in   (beeranked_content volume)
    this rewriter   ──reads──►  /in
                    ──writes──► /out  (beeranked_out volume)
    Caddy           ──serves──► /out  (apex /news/*)

The transformation deletes BR's `.site-nav` and the `<footer>` block
that wraps `.footer-inner` so they are not in the served HTML at all
(not merely hidden via CSS). Any plugin-slot wrappers — even empty
ones — are unwrapped. Then the apex nav and footer from the single
source of truth at `apex_chrome.signed_out.html` are injected
immediately after `<body>` and immediately before `</body>`.

Non-HTML files (sitemap, favicons, media/*) are copied verbatim so
SEO and asset references keep working.

Idempotent: a file is re-transformed only when the input file's mtime
is newer than the output's, or the chrome template has been edited
since the output was last written.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import time
from pathlib import Path


# --- BR chrome that must be removed --------------------------------------

RE_SITE_NAV = re.compile(
    r'<nav\s[^>]*class="[^"]*\bsite-nav\b[^"]*"[^>]*>.*?</nav>',
    re.DOTALL,
)

# BR's <footer> wrapper. It contains <div class="footer-inner"> and may
# contain a trailing <div class="plugin-slot plugin-slot-footer">…</div>
# (left over from the old plugin path). Match the whole <footer>…</footer>.
RE_SITE_FOOTER = re.compile(
    r'<footer(?:\s[^>]*)?>\s*'
    r'<div\s[^>]*class="[^"]*\bfooter-inner\b[^"]*"[^>]*>.*?</div>\s*'
    r'(?:<div\s[^>]*class="[^"]*\bplugin-slot\b[^"]*"[^>]*>.*?</div>\s*)?'
    r'</footer>',
    re.DOTALL,
)

# `<div class="plugin-slot …">…</div>` wrappers. The plugin is disabled
# so the wrappers should be empty, but during the transitional window
# they may still hold the old nav/footer markup. Strip the wrapper AND
# its contents in either case — we inject the apex chrome ourselves
# elsewhere, so duplicate content is the worry, not loss. Matched-pair
# walking is required because our nav contains nested <div> tags.
RE_PLUGIN_SLOT_OPEN = re.compile(
    r'<div\s[^>]*class="[^"]*\bplugin-slot\b[^"]*"[^>]*>'
)
RE_DIV_OPEN_OR_CLOSE = re.compile(r'<div\b[^>]*>|</div>')


def strip_plugin_slots(html: str) -> str:
    out: list[str] = []
    i = 0
    while True:
        m = RE_PLUGIN_SLOT_OPEN.search(html, i)
        if not m:
            out.append(html[i:])
            break
        out.append(html[i : m.start()])
        depth = 1
        j = m.end()
        while depth > 0:
            mm = RE_DIV_OPEN_OR_CLOSE.search(html, j)
            if not mm:
                # Unbalanced — emit the rest verbatim and stop.
                out.append(html[m.start():])
                return ''.join(out)
            if mm.group().startswith('</div'):
                depth -= 1
            else:
                depth += 1
            j = mm.end()
        i = j
    return ''.join(out)


# --- Apex chrome (loaded from the SSOT template) -------------------------

RE_TEMPLATE_NAV = re.compile(r'<nav class="bg-white[\s\S]*?</nav>')
RE_TEMPLATE_FOOTER = re.compile(r'<footer class="bg-white[\s\S]*?</footer>')

HEAD_INJECT = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    '<link rel="stylesheet" href="/branding/apex.css">'
    '<style>'
    'body{font-family:"Inter",ui-sans-serif,system-ui,-apple-system,'
    'BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;'
    'background:rgb(244 241 233);color:rgb(43 70 60);'
    'margin:0;padding:0;}'
    'main{padding-bottom:2rem;}'
    '.kb-mobile-drawer{display:none;}'
    '.kb-mob-open .kb-mobile-drawer{display:block;}'
    '@media(min-width:1024px){.kb-mob-open .kb-mobile-drawer{display:none;}}'
    '</style>'
)

CHROME_MARKER = '<!--kb-chrome-->'


def load_chrome(chrome_path: Path) -> tuple[str, str]:
    text = chrome_path.read_text(encoding='utf-8')
    nav_m = RE_TEMPLATE_NAV.search(text)
    foot_m = RE_TEMPLATE_FOOTER.search(text)
    if not nav_m or not foot_m:
        raise SystemExit(
            f"Could not extract nav/footer blocks from {chrome_path}. "
            "The template must contain a `<nav class=\"bg-white…\">` and a "
            "`<footer class=\"bg-white…\">`."
        )
    return nav_m.group(0), foot_m.group(0)


def transform(html: str, nav_html: str, footer_html: str) -> str:
    # 1. Strip BR's default chrome from the body.
    html = RE_SITE_NAV.sub('', html)
    html = RE_SITE_FOOTER.sub('', html)
    # 2. Strip every <div class="plugin-slot …">…</div> (and contents).
    html = strip_plugin_slots(html)
    # 3. Inject head additions exactly once.
    if CHROME_MARKER not in html:
        html = html.replace(
            '</head>', CHROME_MARKER + HEAD_INJECT + '</head>', 1
        )
    # 4. Inject our nav immediately after <body…>.
    html = re.sub(
        r'(<body[^>]*>)',
        lambda m: m.group(1) + nav_html,
        html,
        count=1,
    )
    # 5. Inject our footer immediately before </body>.
    html = html.replace('</body>', footer_html + '</body>', 1)
    return html


def needs_update(src: Path, dst: Path, chrome_mtime: float) -> bool:
    if not dst.exists():
        return True
    dst_mtime = dst.stat().st_mtime
    return src.stat().st_mtime > dst_mtime or chrome_mtime > dst_mtime


def sync_once(
    in_root: Path,
    out_root: Path,
    nav_html: str,
    footer_html: str,
    chrome_mtime: float,
) -> tuple[int, int]:
    written = 0
    removed = 0
    seen: set[Path] = set()

    for src in in_root.rglob('*'):
        if src.is_dir():
            continue
        rel = src.relative_to(in_root)
        seen.add(rel)
        dst = out_root / rel
        if not needs_update(src, dst, chrome_mtime):
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix.lower() in {'.html', '.htm'}:
            try:
                html = src.read_text(encoding='utf-8')
            except (UnicodeDecodeError, OSError):
                shutil.copy2(src, dst)
                written += 1
                continue
            dst.write_text(
                transform(html, nav_html, footer_html), encoding='utf-8'
            )
        else:
            shutil.copy2(src, dst)
        written += 1

    # Garbage-collect files removed from input.
    for dst in list(out_root.rglob('*')):
        if dst.is_dir():
            continue
        rel = dst.relative_to(out_root)
        if rel not in seen:
            dst.unlink()
            removed += 1
    for d in sorted(
        (p for p in out_root.rglob('*') if p.is_dir()),
        key=lambda p: len(p.parts),
        reverse=True,
    ):
        try:
            d.rmdir()
        except OSError:
            pass

    return written, removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--in', dest='input', type=Path, required=True)
    parser.add_argument('--out', dest='output', type=Path, required=True)
    parser.add_argument('--chrome', type=Path, required=True)
    parser.add_argument('--interval', type=float, default=5.0)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)

    last_chrome_mtime = -1.0
    nav_html = footer_html = ''

    while True:
        try:
            chrome_mtime = (
                args.chrome.stat().st_mtime if args.chrome.exists() else 0.0
            )
            if chrome_mtime != last_chrome_mtime:
                nav_html, footer_html = load_chrome(args.chrome)
                last_chrome_mtime = chrome_mtime
                print(
                    f"[chrome] loaded template ({len(nav_html)} + "
                    f"{len(footer_html)} bytes)",
                    flush=True,
                )

            if args.input.exists():
                written, removed = sync_once(
                    args.input,
                    args.output,
                    nav_html,
                    footer_html,
                    chrome_mtime,
                )
                if written or removed:
                    print(
                        f"[sync] +{written} files, -{removed} files",
                        flush=True,
                    )
            else:
                print(
                    f"[wait] input dir {args.input} not present yet",
                    flush=True,
                )
        except Exception as exc:
            print(f"[error] {exc}", file=sys.stderr, flush=True)

        if args.once:
            break
        time.sleep(args.interval)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
