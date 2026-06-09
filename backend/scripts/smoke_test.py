"""Launch-day smoke test.

Hits the most important read paths over HTTP and reports pass/fail with
status codes. Designed to be run from the deploy server right after the
docker stack comes up:

    python -m scripts.smoke_test https://api.kotobaseed.net

It deliberately doesn't authenticate — these are the routes a brand-new
visitor would hit. A non-2xx (or 3xx) on any of them is a launch blocker.

Add tenant-scoped checks by setting `KOTOBASEED_SMOKE_TUTOR_SLUG=vasso`.
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request

CHECKS: list[tuple[str, str]] = [
    ("apex healthz", "/healthz"),
    ("apex readyz", "/readyz"),
    ("apex root", "/"),
    ("footer config", "/platform/footer"),
    ("themes catalogue", "/tutor/themes"),
]


def _hit(base: str, path: str, *, host_header: str | None = None) -> tuple[int, str]:
    req = urllib.request.Request(base.rstrip("/") + path)
    if host_header:
        req.add_header("Host", host_header)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, ""
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "usage: python -m scripts.smoke_test <base_url> [tenant_slug]",
            file=sys.stderr,
        )
        return 2
    base = sys.argv[1].rstrip("/")
    slug = sys.argv[2] if len(sys.argv) > 2 else os.environ.get(
        "KOTOBASEED_SMOKE_TUTOR_SLUG"
    )

    failed = 0
    print(f"smoke-test against {base}")
    for label, path in CHECKS:
        status, err = _hit(base, path)
        ok = 200 <= status < 400
        marker = "✓" if ok else "✗"
        print(f"  {marker}  {label:<24} {path:<30} → {status} {err}".rstrip())
        if not ok:
            failed += 1

    if slug:
        tenant_checks = [
            ("tenant /tutor/me", "/tutor/me"),
            ("tenant /tutor/page-sections", "/tutor/page-sections"),
        ]
        host = f"{slug}.{base.split('://', 1)[-1].split('/', 1)[0]}"
        # When the API is at api.example.net, the host header for tenant
        # reads is <slug>.example.net.
        host = host.replace("api.", "")
        print(f"\ntenant ({slug}) — Host: {host}")
        for label, path in tenant_checks:
            status, err = _hit(base, path, host_header=host)
            ok = 200 <= status < 400
            marker = "✓" if ok else "✗"
            print(f"  {marker}  {label:<24} {path:<30} → {status} {err}".rstrip())
            if not ok:
                failed += 1

    print()
    if failed:
        print(f"FAILED — {failed} check(s) didn't pass.")
        return 1
    print("ALL GREEN — platform is responding on the basics.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
