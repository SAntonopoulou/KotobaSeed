"""Password hashing + JWT helpers.

All secrets come from `config.settings` — startup fails loudly if they're
missing rather than silently running with insecure defaults.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Request, Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

# Re-exported for backward compat with code that imports these from here.
SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
STRIPE_SECRET_KEY = settings.stripe_secret_key
STRIPE_WEBHOOK_SECRET = settings.stripe_webhook_secret

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


hash_password = get_password_hash


def client_ip(request: Request) -> str | None:
    """Best-effort real client IP.

    Order: Cloudflare's CF-Connecting-IP (set when CF proxy fronts us) →
    X-Forwarded-For (first hop) → direct peer.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
) -> str:
    """Issue a signed JWT for the given subject.

    `expires_delta` overrides the default expiry from settings when supplied.
    """
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {"exp": expire, "sub": str(subject), "iat": now}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Return the decoded payload or None if the token is invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# --- Cross-subdomain auth cookie ------------------------------------------
# A shared session cookie scoped to .kotobaseed.net so signing in on the
# apex automatically authenticates the tutor's subdomain (and vice-versa).
# Without this, the JWT lives in per-origin localStorage and the user has
# to authenticate again on every subdomain.

AUTH_COOKIE_NAME = settings.auth_cookie_name


def set_auth_cookie(response: Response, token: str) -> None:
    """Attach the shared auth cookie to ``response`` for cross-subdomain SSO."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        domain=settings.auth_cookie_domain,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
    )


def clear_auth_cookie(response: Response) -> None:
    """Drop the shared auth cookie on logout / hard token reset."""
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        domain=settings.auth_cookie_domain,
        path="/",
    )


def token_from_request(request: Request) -> str | None:
    """Pull the JWT from either the Authorization header (preferred) or the
    shared auth cookie. Returns None when neither is present."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        candidate = auth.split(" ", 1)[1].strip()
        if candidate:
            return candidate
    cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
    return cookie_token or None
