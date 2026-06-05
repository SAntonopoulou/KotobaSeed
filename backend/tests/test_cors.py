"""Smoke test that the CORS middleware actually attaches headers to the
public marketplace endpoint when called from the apex frontend origin.

If these pass but Sophia still sees CORS errors in her browser, it's
almost certainly that her dev backend hasn't been restarted to pick up
the new marketplace router registration.
"""

from __future__ import annotations


def test_marketplace_response_has_cors_headers(client):
    """A GET from an allowed origin must get Access-Control-Allow-Origin
    back, otherwise the browser blocks the response."""
    r = client.get(
        "/marketplace/tutors",
        headers={"Origin": "http://localhost:5173"},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_preflight_options_succeeds(client):
    """The browser sends an OPTIONS preflight when the request has
    custom headers (e.g. Authorization). The CORS middleware must respond
    200 with the matching origin echoed back."""
    r = client.options(
        "/marketplace/tutors",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_regex_matches_localhost_subdomain(client):
    """The dev regex allows any *.localhost subdomain so tutor sites at
    `vasso.localhost:5173` work without per-tutor config."""
    r = client.get(
        "/marketplace/tutors",
        headers={"Origin": "http://vasso.localhost:5173"},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://vasso.localhost:5173"
