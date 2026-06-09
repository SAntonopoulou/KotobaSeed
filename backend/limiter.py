"""Shared rate limiter — single instance so app middleware and route
decorators agree on counters.

Storage backend:
- REDIS_URL set → Redis (counters survive restarts and are shared across
  uvicorn workers if we ever scale past one).
- Otherwise → in-memory (fine for single-worker dev).

main.py wires this into `app.state.limiter` + the SlowAPI middleware.
Routers import `limiter` and decorate sensitive endpoints with e.g.
`@limiter.limit("5/minute")`.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import settings
from .security import AUTH_COOKIE_NAME, decode_access_token


def user_or_ip_key(request: Request) -> str:
    """Key on the authenticated user when we can identify them cheaply
    from the auth header or cookie, otherwise fall back to the remote
    address. We deliberately avoid a DB hit here — the JWT subject is
    enough to disambiguate, and a stale/expired token just degrades to
    the IP key, which is acceptable for rate-limit accounting.
    """
    auth = request.headers.get("authorization", "")
    token: str | None = None
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip() or None
    if token is None:
        token = request.cookies.get(AUTH_COOKIE_NAME)
    if token:
        try:
            payload = decode_access_token(token)
            sub = payload.get("sub") if payload else None
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    return f"ip:{get_remote_address(request)}"


def _build_limiter() -> Limiter:
    if settings.redis_url:
        return Limiter(
            key_func=user_or_ip_key,
            default_limits=[],
            storage_uri=settings.redis_url,
        )
    return Limiter(key_func=user_or_ip_key, default_limits=[])


limiter = _build_limiter()
