"""Tenant resolution: Host header → Tutor.

Resolution order on every request:
1. `OPTIONS` requests skip resolution (CORS preflights must succeed regardless).
2. In dev/test, an `X-Tenant-Slug` header overrides Host parsing — needed
   because pytest's TestClient sends `Host: testserver`.
3. Apex host (`kotobaseed.net`) → no tenant.
4. Reserved subdomain (`www`, `api`, `admin`) → no tenant.
5. Single-label subdomain of `tenant_subdomain_suffix` → look up by slug.
6. Anything else → treat as custom-domain candidate, look up by `custom_domain`.

The middleware stashes `request.state.tutor_id` (int | None) and
`request.state.tutor_slug` (str | None). It does NOT stash the ORM object —
its session ends with the middleware. The `CurrentTutor` dependency
re-fetches with the request's session.

Sync DB lookups inside async middleware is suboptimal (blocks the event
loop) but matches the rest of the codebase's sync-everywhere stance from
Step 0. Revisit if we adopt AsyncSession.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

from . import database as _database  # late binding so tests can swap engine
from .config import settings
from .database import get_session
from .models import Tutor


def _strip_port(host: str) -> str:
    return host.split(":", 1)[0].lower()


def _resolve_tutor_for_host(host: str, session: Session) -> Tutor | None:
    """Return Tutor matching `host`, or None for apex/reserved/no-match.

    `host` is expected lowercased + port-stripped.
    """
    if not host or host == settings.platform_apex:
        return None

    suffix = settings.tenant_subdomain_suffix
    if host.endswith(suffix):
        slug = host[: -len(suffix)]
        # Empty slug, nested subdomain, or reserved name → no tenant.
        if not slug or "." in slug or slug in settings.reserved_subdomain_set:
            return None
        return session.exec(select(Tutor).where(Tutor.tutor_slug == slug)).first()

    # Custom-domain candidate. TODO: signup must lowercase custom_domain on
    # write so this stays unambiguous against the unique index.
    return session.exec(select(Tutor).where(Tutor.custom_domain == host)).first()


def _resolve_for_request(request: Request) -> tuple[int | None, str | None]:
    """Return (tutor_id, tutor_slug) for the request, or (None, None)."""
    if (
        settings.environment in {"dev", "test"}
        and (override := request.headers.get(settings.tenant_dev_override_header))
    ):
        override_slug = override.strip().lower()
        if not override_slug or override_slug in settings.reserved_subdomain_set:
            return (None, None)
        with Session(_database.engine) as s:
            tutor = s.exec(select(Tutor).where(Tutor.tutor_slug == override_slug)).first()
            return (tutor.id, tutor.tutor_slug) if tutor else (None, None)

    host = _strip_port(request.headers.get("host", ""))
    with Session(_database.engine) as s:
        tutor = _resolve_tutor_for_host(host, s)
        return (tutor.id, tutor.tutor_slug) if tutor else (None, None)


class TenantResolutionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        tutor_id, tutor_slug = _resolve_for_request(request)
        request.state.tutor_id = tutor_id
        request.state.tutor_slug = tutor_slug
        return await call_next(request)


# --- FastAPI dependencies ----------------------------------------------------


def get_current_tutor_optional(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> Tutor | None:
    tutor_id: int | None = getattr(request.state, "tutor_id", None)
    if tutor_id is None:
        return None
    return session.get(Tutor, tutor_id)


def get_current_tutor(
    tutor: Annotated[Tutor | None, Depends(get_current_tutor_optional)],
) -> Tutor:
    if tutor is None:
        # 404, not 403 — don't leak whether a slug exists to anonymous probes.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tutor for this host.")
    return tutor


CurrentTutor = Annotated[Tutor, Depends(get_current_tutor)]
CurrentTutorOptional = Annotated[Tutor | None, Depends(get_current_tutor_optional)]


def add_tenant_middleware(app: ASGIApp) -> None:
    """Register `TenantResolutionMiddleware`. Tiny wrapper so main.py stays terse."""
    app.add_middleware(TenantResolutionMiddleware)  # type: ignore[arg-type]
