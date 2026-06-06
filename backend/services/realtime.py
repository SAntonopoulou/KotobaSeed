"""Realtime push helpers.

Wraps the conversations.ConnectionManager so other routers can fire WS
push events without importing conversations directly (the import graph
would cycle).

This is fire-and-forget: failures are swallowed because the underlying
notification row was already committed. WS is a UX accelerator, not the
source of truth — the existing polling fetch still works as a fallback.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

log = logging.getLogger(__name__)


def push_to_user(user_id: int, event: dict[str, Any]) -> None:
    """Broadcast `event` (a dict, JSON-serialised on send) to every live
    WebSocket the user has open. No-op if the user has no live sockets.

    Safe to call from sync code paths — schedules the send on the running
    asyncio loop and returns immediately."""
    try:
        # Local import to break the import cycle (conversations imports
        # users → users transitively imports services).
        from ..routers.conversations import manager

        payload = json.dumps(event)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is None:
            # No running loop (e.g. called from tests or a sync script).
            # Spawn one just for this send.
            asyncio.run(manager.send_user_notification(user_id, payload))
        else:
            loop.create_task(manager.send_user_notification(user_id, payload))
    except Exception:
        log.exception("Realtime push to user %s failed", user_id)


def push_notification_event(user_id: int, *, message: str, link: str | None) -> None:
    """Push a NOTIFICATION_NEW event so the user's Notifications dropdown
    can update without polling. The event payload is intentionally small
    — the frontend re-fetches the full list on receipt."""
    push_to_user(
        user_id,
        {
            "type": "NOTIFICATION_NEW",
            "message": message,
            "link": link,
        },
    )
