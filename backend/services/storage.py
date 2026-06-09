"""Object storage facade.

Two backends, picked automatically at boot time:

- **R2** (Cloudflare, S3-compatible) — used when every ``R2_*`` setting is
  populated. Production default once Cloudflare R2 is enabled on the
  account.
- **Local volume** — fallback when R2 isn't configured. Writes to
  ``settings.local_uploads_dir`` (mounted into the backend container as a
  Docker volume) and serves files back through ``/uploads/*``, which the
  backend exposes via ``StaticFiles`` and Caddy proxies through.

The two implementations expose the same surface (``put_object``,
``delete_object``, ``key_from_public_url``) so the rest of the codebase
never needs to know which one is active. Switching backends in production
is a matter of populating the R2 env vars and recreating the backend
container — nothing else has to change.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO

from ..config import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------


def _r2_configured() -> bool:
    return all(
        [
            settings.r2_account_id,
            settings.r2_bucket,
            settings.r2_access_key_id,
            settings.r2_secret_access_key,
            settings.r2_public_url_base,
        ]
    )


def active_backend() -> str:
    """Return ``"r2"`` or ``"local"``."""
    return "r2" if _r2_configured() else "local"


def is_configured() -> bool:
    """True when *some* backend is usable. Local is always usable as long
    as the uploads directory exists and is writable."""
    if _r2_configured():
        return True
    # Local backend just needs the target directory to be writable.
    try:
        _local_root().mkdir(parents=True, exist_ok=True)
        return os.access(_local_root(), os.W_OK)
    except Exception:
        log.exception("Local uploads directory is not writable")
        return False


# ---------------------------------------------------------------------------
# R2 backend
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _r2_client():
    import boto3
    from botocore.client import Config

    endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    # R2 requires SigV4 + path-style. ``virtual``-style URLs work too but
    # path-style is the documented default and avoids DNS surprises with
    # bucket names that contain dots.
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name="auto",
    )


def _r2_put(key: str, body: bytes | BinaryIO, content_type: str, cache_control: str) -> str:
    client = _r2_client()
    client.put_object(
        Bucket=settings.r2_bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl=cache_control,
    )
    base = settings.r2_public_url_base.rstrip("/")
    return f"{base}/{key}"


def _r2_delete(key: str) -> None:
    try:
        _r2_client().delete_object(Bucket=settings.r2_bucket, Key=key)
    except Exception:
        log.exception("R2 delete failed for key=%s", key)


def _r2_key_from_url(public_url: str) -> str | None:
    base = (settings.r2_public_url_base or "").rstrip("/")
    if not base or not public_url.startswith(base + "/"):
        return None
    return public_url[len(base) + 1 :]


# ---------------------------------------------------------------------------
# Local-volume backend
# ---------------------------------------------------------------------------


def _local_root() -> Path:
    return Path(settings.local_uploads_dir).resolve()


def _local_url_prefix() -> str:
    # The SPA fetches uploads same-origin via /uploads/* (Caddy routes
    # this to the backend, same shape as /api/*). We stamp a relative
    # URL into the DB so it follows whichever host the user is on.
    return "/uploads"


def _local_safe_key(key: str) -> str:
    # Defence in depth — reject any traversal attempt before we hit the
    # filesystem. Callers always use random hex keys today, but if a
    # future caller ever takes user input this is the choke point.
    if "\x00" in key or ".." in key.split("/") or key.startswith("/"):
        raise ValueError(f"invalid storage key: {key!r}")
    return key


def _local_put(key: str, body: bytes | BinaryIO, content_type: str, cache_control: str) -> str:
    key = _local_safe_key(key)
    target = _local_root() / key
    target.parent.mkdir(parents=True, exist_ok=True)
    data = body if isinstance(body, (bytes, bytearray)) else body.read()
    # Atomic-ish write: stage to a sibling then rename. Avoids serving a
    # half-written file if the request is interrupted.
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(target)
    # We deliberately ignore cache_control / content_type here — nginx
    # / Caddy figure those out from the file extension at serve time.
    return f"{_local_url_prefix()}/{key}"


def _local_delete(key: str) -> None:
    try:
        path = _local_root() / _local_safe_key(key)
        if path.exists():
            path.unlink()
    except Exception:
        log.exception("Local delete failed for key=%s", key)


def _local_key_from_url(public_url: str) -> str | None:
    prefix = _local_url_prefix() + "/"
    if not public_url or not public_url.startswith(prefix):
        return None
    return public_url[len(prefix):]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def put_object(
    *,
    key: str,
    body: bytes | BinaryIO,
    content_type: str,
    cache_control: str = "public, max-age=31536000, immutable",
) -> str:
    """Upload an object and return its public URL."""
    if active_backend() == "r2":
        return _r2_put(key, body, content_type, cache_control)
    return _local_put(key, body, content_type, cache_control)


def delete_object(*, key: str) -> None:
    """Delete an object. Silently swallows errors so callers can blindly
    clean up old files after a re-upload."""
    if active_backend() == "r2":
        _r2_delete(key)
    else:
        _local_delete(key)


def key_from_public_url(public_url: str) -> str | None:
    """Reverse a public URL back to the bucket/path key, or None if the
    URL isn't ours. Tries both backends because a single user might have
    an old local-volume avatar URL after we migrate to R2."""
    if not public_url:
        return None
    return _r2_key_from_url(public_url) or _local_key_from_url(public_url)
