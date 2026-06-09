"""Lightweight per-user rate limiting via FastAPI dependency.

We tried slowapi first; its decorator approach loses the FastAPI Request
object through keyword dispatch on this Python/FastAPI combo (see the
chat hardening notes), so we ship our own. The needs here are modest:
keep chat-write paths from being abused by a single account, with
per-user keys (not per-IP — too many users share NAT IPs at schools).

Storage:
- ``REDIS_URL`` configured → Redis INCR-with-expire. Survives restarts
  and is shared across workers when we scale past one.
- Otherwise → in-process dict. Fine for dev, single-worker test runs.

The window is fixed (1 minute or 1 hour) rather than sliding because
fixed-window is one Redis round trip per call and the bursty
boundary-second is acceptable for chat-write rate-limiting.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from threading import Lock
from typing import Annotated

from fastapi import Depends, HTTPException, status

from ..config import settings
from ..deps import get_current_user
from ..models import User

_inprocess_counters: dict[str, tuple[int, float]] = {}
_inprocess_lock = Lock()
# Opportunistic eviction: walk the dict every Nth call and drop entries
# whose window has elapsed. Keeps memory bounded without taking a lock
# on every read. Tuned high so the cost amortises out.
_PRUNE_EVERY = 256
_calls_since_prune = 0


def _inprocess_incr(key: str, window_seconds: int) -> int:
    """Fixed-window counter. Returns the count after incrementing."""
    global _calls_since_prune
    now = time.monotonic()
    with _inprocess_lock:
        count, expires = _inprocess_counters.get(key, (0, 0.0))
        if expires <= now:
            count = 0
            expires = now + window_seconds
        count += 1
        _inprocess_counters[key] = (count, expires)
        # Opportunistic eviction. Cheap enough at 1-in-N to leave the
        # rest of the hot path untouched.
        _calls_since_prune += 1
        if _calls_since_prune >= _PRUNE_EVERY:
            _calls_since_prune = 0
            for k, (_, exp) in list(_inprocess_counters.items()):
                if exp <= now:
                    _inprocess_counters.pop(k, None)
        return count


_redis_client = None


def _get_redis():
    """Lazy-resolve a Redis client. Returns None when not configured."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not settings.redis_url:
        return None
    try:
        import redis  # type: ignore

        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        return _redis_client
    except Exception:
        # Misconfigured Redis shouldn't break the chat path — degrade
        # to in-process counting and move on.
        return None


def _redis_incr(key: str, window_seconds: int) -> int | None:
    client = _get_redis()
    if client is None:
        return None
    try:
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = pipe.execute()
        return int(count)
    except Exception:
        return None


def rate_limit(
    key_prefix: str,
    *,
    limit: int,
    window_seconds: int,
) -> Callable:
    """Return a FastAPI dependency that enforces ``limit`` per ``window_seconds``.

    The dependency keys on the authenticated user id (resolved via the
    standard ``get_current_user`` dep) so two users on the same NAT IP
    don't share a budget.
    """

    def dependency(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        key = f"rl:{key_prefix}:user:{current_user.id}"
        count = _redis_incr(key, window_seconds)
        if count is None:
            count = _inprocess_incr(key, window_seconds)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You're sending those a bit fast — slow down for a minute.",
            )
        return current_user

    return dependency
