"""Shared rate limiter — single instance so app middleware and route
decorators agree on counters.

main.py wires this into `app.state.limiter` + the SlowAPI middleware.
Routers import `limiter` and decorate sensitive endpoints with e.g.
`@limiter.limit("5/minute")`.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
