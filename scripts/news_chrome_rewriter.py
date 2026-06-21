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
import urllib.request
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

# --- Apex SPA head extraction --------------------------------------------
#
# /news pages load the apex SPA bundle. main.jsx detects the
# #kb-navbar-root / #kb-footer-root placeholders and mounts ONLY the
# Navbar + Footer React components via news_chrome_mount.jsx, so the
# /news chrome is literally the same React tree as the apex SPA's
# signed-in / signed-out chrome — same components, same providers,
# same auth state. Editing Navbar.jsx OR Footer.jsx updates both
# surfaces with no /news-specific code path.
#
# The build hashes the bundle filename each rebuild. Rather than copy
# the latest hashed asset to a stable path, we fetch the apex index
# from the internal `frontend` container, extract the asset link/script
# tags, and inline them into every /news page. Each frontend rebuild
# auto-propagates — no copy step, no stale window.

APEX_FRONTEND_URL = 'http://frontend/'
APEX_HEAD_TTL_S = 30.0
_apex_head_cached: str = ''
_apex_head_expires: float = 0.0
# Wall-clock time when the apex head last changed. Files whose
# output was written before this need to be re-processed so they
# reference the latest hashed assets.
_apex_head_changed_at: float = 0.0

# Tags we lift verbatim from the apex SPA's <head>. We keep the
# preconnects + Google Fonts link (font stack matches the apex), the
# apex CSS link (Tailwind + index.css), the favicon, the modulepreload
# hints, and the module entry script. We deliberately drop the apex
# index's <title>, <meta>, and analytics so BR's per-page SEO metadata
# wins.
_HEAD_TAG_PATTERNS = [
    re.compile(r'<link\b[^>]*\brel="preconnect"[^>]*>', re.IGNORECASE),
    re.compile(r'<link\b[^>]*\brel="stylesheet"[^>]*>', re.IGNORECASE),
    re.compile(r'<link\b[^>]*\brel="modulepreload"[^>]*>', re.IGNORECASE),
    re.compile(r'<link\b[^>]*\brel="icon"[^>]*>', re.IGNORECASE),
    re.compile(
        r'<script\b[^>]*\btype="module"[^>]*>[^<]*</script>', re.IGNORECASE,
    ),
]


def fetch_apex_head() -> str:
    """Return concatenated link/script tags from the apex index.html head."""
    try:
        req = urllib.request.Request(
            APEX_FRONTEND_URL,
            headers={'User-Agent': 'news-chrome-rewriter/1.0'},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode('utf-8', errors='replace')
    except Exception as exc:
        print(f'[apex-head] fetch failed: {exc}', file=sys.stderr, flush=True)
        return ''
    m = re.search(r'<head\b[^>]*>(.*?)</head>', html, re.DOTALL | re.IGNORECASE)
    head = m.group(1) if m else html
    out: list[str] = []
    for pat in _HEAD_TAG_PATTERNS:
        for hit in pat.finditer(head):
            out.append(hit.group(0))
    return ''.join(out)


def get_apex_head() -> str:
    global _apex_head_cached, _apex_head_expires, _apex_head_changed_at
    now = time.time()
    if _apex_head_expires > now and _apex_head_cached:
        return _apex_head_cached
    fetched = fetch_apex_head()
    if fetched:
        if fetched != _apex_head_cached:
            _apex_head_changed_at = now
        _apex_head_cached = fetched
        _apex_head_expires = now + APEX_HEAD_TTL_S
    return _apex_head_cached


def apex_head_changed_at() -> float:
    return _apex_head_changed_at


# Content stylesheet path inside the sidecar (bind-mounted from
# `branding/news-content.css` in the repo). The URL we link to is
# stable, but we append `?v=<mtime>` so Cloudflare's edge cache
# busts the moment we edit the file — no manual purge needed.
CONTENT_CSS_PATH = Path('/app/news-content.css')
_content_css_last_mtime: float = -1.0
_content_css_changed_at: float = 0.0


def _refresh_content_css() -> None:
    """Bump the change-at timestamp to NOW when the css file mtime advances."""
    global _content_css_last_mtime, _content_css_changed_at
    try:
        mtime = CONTENT_CSS_PATH.stat().st_mtime
    except OSError:
        return
    if mtime != _content_css_last_mtime:
        _content_css_last_mtime = mtime
        _content_css_changed_at = time.time()


def content_css_link() -> str:
    _refresh_content_css()
    mtime = int(_content_css_last_mtime) if _content_css_last_mtime > 0 else 0
    return (
        f'<link rel="stylesheet" href="/branding/news-content.css?v={mtime}">'
    )


def content_css_changed_at() -> float:
    _refresh_content_css()
    return _content_css_changed_at


# Static-only injection: BR-base resets + mobile-drawer wiring. Anything
# styling-related comes from the apex CSS bundle linked above.
HEAD_INJECT_TAIL = (
    '<style>'
    # BR's base stylesheet emits an unscoped `footer { padding:2.5rem 0;
    # margin-top:6rem; border-top:…; background:var(--bg-warm); }` rule
    # that matches our chrome <footer>. Tailwind classes on the chrome
    # already win on `background` (.bg-white) and on `margin-top` (.mt-auto),
    # but Tailwind doesn't set padding on the outer <footer> (the chrome
    # template applies py-10 to the inner div), so BR's padding survives.
    # Override ONLY padding, and use a descendant selector because
    # Footer.jsx wraps the footer in an extra <div> when it renders via
    # dangerouslySetInnerHTML. Don't touch background or border — that
    # would beat Tailwind on specificity and make the chrome invisible.
    '#kb-footer-root footer{padding:0;margin-top:0;}'
    # BR's `html { font-family: var(--font) }` (Inter) gets inherited by
    # article content. Use the same `font-sans` stack the apex SPA does,
    # so article text and chrome both pick up Quicksand.
    'body{font-family:Quicksand,Inter,ui-sans-serif,system-ui,-apple-system,'
    'BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}'
    # Mobile-drawer toggle wiring for the no-JS signed-out fallback.
    # Once React mounts, the real Navbar component drives its own state.
    '.kb-mobile-drawer{display:none;}'
    '.kb-mob-open .kb-mobile-drawer{display:block;}'
    '@media(min-width:1024px){.kb-mob-open .kb-mobile-drawer{display:none;}}'
    '</style>'
)

CHROME_MARKER_START = '<!--kb-chrome-start-->'
CHROME_MARKER_END = '<!--kb-chrome-end-->'
RE_EXISTING_INJECT = re.compile(
    re.escape(CHROME_MARKER_START) + r'.*?' + re.escape(CHROME_MARKER_END),
    re.DOTALL,
)


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


BODY_MARKER_NAV_START = '<!--kb-navbar-mount-start-->'
BODY_MARKER_NAV_END = '<!--kb-navbar-mount-end-->'
BODY_MARKER_FOOTER_START = '<!--kb-footer-mount-start-->'
BODY_MARKER_FOOTER_END = '<!--kb-footer-mount-end-->'
RE_EXISTING_NAV_MOUNT = re.compile(
    re.escape(BODY_MARKER_NAV_START) + r'.*?' + re.escape(BODY_MARKER_NAV_END),
    re.DOTALL,
)
RE_EXISTING_FOOTER_MOUNT = re.compile(
    re.escape(BODY_MARKER_FOOTER_START) + r'.*?' + re.escape(BODY_MARKER_FOOTER_END),
    re.DOTALL,
)


RE_BR_FAVICON = re.compile(
    r'<link\b[^>]*\brel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>',
    re.IGNORECASE,
)
# Every <style>…</style> block. We strip all of them from the BR head
# and let our own stylesheet (news-content.css) + the apex CSS bundle
# be the sole sources of styling. None of BR's resets, Astro-scoped
# component styles, or :focus-visible rules should reach the page.
RE_STYLE_BLOCK = re.compile(
    r'<style\b[^>]*>.*?</style>', re.DOTALL | re.IGNORECASE,
)
# Every <link rel="stylesheet" …>. We strip these from BR's head too
# so the only CSS that loads is the set we explicitly inject (apex
# bundle + Google Fonts + news-content.css).
RE_STYLESHEET_LINK = re.compile(
    r'<link\b[^>]*\brel="stylesheet"[^>]*/?\s*>',
    re.IGNORECASE,
)
RE_HEAD_BLOCK = re.compile(
    r'(<head\b[^>]*>)(.*?)(</head>)',
    re.DOTALL | re.IGNORECASE,
)


def strip_br_styles_in_head(html: str) -> str:
    """Remove all <style> blocks and stylesheet <link>s from <head>.

    Only touches content inside <head> so BR's body-level inline
    `style=""` attributes and any in-body <style> tags are untouched
    (we override those with !important rules in news-content.css).
    Run AFTER stripping the existing marker block so we don't nuke
    our own <style> tag along with BR's.
    """
    def _scrub(m: re.Match) -> str:
        head = m.group(2)
        head = RE_STYLE_BLOCK.sub('', head)
        head = RE_STYLESHEET_LINK.sub('', head)
        return m.group(1) + head + m.group(3)

    return RE_HEAD_BLOCK.sub(_scrub, html, count=1)


def transform(html: str, nav_html: str, footer_html: str) -> str:
    # 1. Strip BR's default chrome from the body.
    html = RE_SITE_NAV.sub('', html)
    html = RE_SITE_FOOTER.sub('', html)
    # 1b. Strip BR's <link rel="icon" …> — the apex SPA's <head>
    #     (extracted by get_apex_head) brings the kotobaseed favicon.svg.
    #     Two competing icon links is just noise; we want the apex's.
    html = RE_BR_FAVICON.sub('', html)
    # 2. Strip every `<div class="plugin-slot …">…</div>` (and contents).
    html = strip_plugin_slots(html)
    # 3. Strip the prior marker block (so our own <style> doesn't get
    #    eaten in the next step), then strip every BR <style> block
    #    and BR <link rel="stylesheet"> from <head>. After this, the
    #    only CSS the page loads is what we inject below: the apex CSS
    #    bundle, the Google Fonts stylesheet, news-content.css, and our
    #    tiny inline <style> tail. No BR resets, no Astro-scoped rules,
    #    no :focus-visible outline — nothing.
    html = RE_EXISTING_INJECT.sub('', html, count=1)
    html = strip_br_styles_in_head(html)
    head_block = (
        CHROME_MARKER_START
        + get_apex_head()
        + content_css_link()
        + HEAD_INJECT_TAIL
        + CHROME_MARKER_END
    )
    html = html.replace('</head>', head_block + '</head>', 1)
    # 4. Strip any prior chrome mount block (re-runs).
    html = RE_EXISTING_NAV_MOUNT.sub('', html)
    html = RE_EXISTING_FOOTER_MOUNT.sub('', html)
    # Also strip any prior unwrapped apex chrome (from earlier rewriter
    # versions that injected raw <nav>/<footer> at body level).
    html = re.sub(
        r'<nav class="bg-white shadow-md sticky[\s\S]*?</nav>', '', html
    )
    html = re.sub(
        r'<footer class="bg-white border-t[\s\S]*?</footer>', '', html
    )
    # 5. Inject the navbar mount root immediately after <body…>. The
    #    static signed-out chrome inside it is a no-JS / crawler
    #    fallback — once main.jsx picks up #kb-navbar-root, ReactDOM
    #    replaces it with the real Navbar (signed-in or out, with full
    #    auth-aware widgets).
    nav_block = (
        BODY_MARKER_NAV_START
        + '<div id="kb-navbar-root">' + nav_html + '</div>'
        + BODY_MARKER_NAV_END
    )
    html = re.sub(
        r'(<body[^>]*>)',
        lambda m: m.group(1) + nav_block,
        html,
        count=1,
    )
    # 6. Inject the footer mount root immediately before </body>.
    footer_block = (
        BODY_MARKER_FOOTER_START
        + '<div id="kb-footer-root">' + footer_html + '</div>'
        + BODY_MARKER_FOOTER_END
    )
    html = html.replace('</body>', footer_block + '</body>', 1)
    return html


def needs_update(
    src: Path, dst: Path, chrome_mtime: float, apex_changed_at: float
) -> bool:
    if not dst.exists():
        return True
    dst_mtime = dst.stat().st_mtime
    return (
        src.stat().st_mtime > dst_mtime
        or chrome_mtime > dst_mtime
        or apex_changed_at > dst_mtime
    )


def sync_once(
    in_root: Path,
    out_root: Path,
    nav_html: str,
    footer_html: str,
    chrome_mtime: float,
    apex_changed_at: float,
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
        if not needs_update(src, dst, chrome_mtime, apex_changed_at):
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

            # Warm the apex-head cache before the file walk so the change
            # detector and the transform get a consistent value. Take
            # the max of apex-head-change-time and content-css mtime so
            # editing news-content.css also triggers a re-process.
            get_apex_head()
            change_time = max(
                apex_head_changed_at(), content_css_changed_at()
            )

            if args.input.exists():
                written, removed = sync_once(
                    args.input,
                    args.output,
                    nav_html,
                    footer_html,
                    chrome_mtime,
                    change_time,
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
