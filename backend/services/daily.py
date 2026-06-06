"""Daily.co API wrapper.

Lazy: every helper raises `DailyNotConfiguredError` if `daily_api_key`
isn't set. Callers should translate that to a 503 with a clear message
so the rest of the platform keeps working in environments that haven't
wired Daily yet.

We deliberately don't pre-create rooms (e.g. at webhook time). A failed
room creation must never roll back a payment confirmation. Instead the
room is created on the first join request, then memoized on the Booking
row.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)

DAILY_API_BASE = "https://api.daily.co/v1"


class DailyNotConfiguredError(RuntimeError):
    pass


def _require_key() -> str:
    if not settings.daily_api_key:
        raise DailyNotConfiguredError(
            "Daily.co is not configured. Set DAILY_API_KEY to enable classroom video."
        )
    return settings.daily_api_key


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_require_key()}", "Content-Type": "application/json"}


def create_room(
    *,
    name: str,
    expires_at: datetime,
    enable_chat: bool = True,
    enable_recording: bool = False,
) -> dict[str, Any]:
    """Create a Daily room. `name` is the slug; URL is daily_domain + name.

    Auto-expires at `expires_at` so we don't accumulate stale rooms.
    `enable_recording=True` adds the cloud-recording option so the tutor
    can press the record button mid-lesson — Daily uploads to their own
    recordings bucket.
    """
    properties: dict[str, Any] = {
        "exp": int(expires_at.timestamp()),
        "enable_chat": enable_chat,
        "enable_screenshare": True,
        "start_video_off": False,
        "start_audio_off": False,
    }
    if enable_recording:
        # cloud recording, default 720p — Daily.co Premium needed.
        properties["enable_recording"] = "cloud"
    payload = {
        "name": name,
        "privacy": "private",  # tokens required to join
        "properties": properties,
    }
    r = httpx.post(f"{DAILY_API_BASE}/rooms", headers=_headers(), json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def list_recordings(*, room_name: str) -> list[dict[str, Any]]:
    """Return Daily's recording list for a given room. Each entry contains
    `id`, `start_ts`, `duration`, `download_link`, and `status`."""
    r = httpx.get(
        f"{DAILY_API_BASE}/recordings",
        headers=_headers(),
        params={"room_name": room_name},
        timeout=10,
    )
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return r.json().get("data", [])


def recording_access_link(*, recording_id: str) -> str | None:
    """Mint a short-lived signed URL for downloading a single recording."""
    r = httpx.get(
        f"{DAILY_API_BASE}/recordings/{recording_id}/access-link",
        headers=_headers(),
        timeout=10,
    )
    if r.status_code != 200:
        return None
    return r.json().get("download_link")


def create_meeting_token(
    *,
    room_name: str,
    user_name: str,
    is_owner: bool,
    expires_at: datetime,
) -> str:
    """Mint a short-lived JWT that authorizes a participant to join.

    `is_owner=True` for the tutor — gives them moderator powers
    (kick participants, end the call). Students join as regular
    participants.
    """
    payload = {
        "properties": {
            "room_name": room_name,
            "user_name": user_name,
            "is_owner": is_owner,
            "exp": int(expires_at.timestamp()),
        },
    }
    r = httpx.post(
        f"{DAILY_API_BASE}/meeting-tokens", headers=_headers(), json=payload, timeout=10
    )
    r.raise_for_status()
    return r.json()["token"]


def default_room_expiry(scheduled_at: datetime, duration_minutes: int) -> datetime:
    """Room sticks around until scheduled_at + duration + 2h, so late-joining
    + the configured grace period both work."""
    return scheduled_at + timedelta(minutes=duration_minutes) + timedelta(hours=2)


def default_token_expiry(scheduled_at: datetime, duration_minutes: int) -> datetime:
    """Token is shorter-lived than the room — just enough to cover the
    full lesson + grace period."""
    return scheduled_at + timedelta(minutes=duration_minutes + settings.classroom_join_grace_minutes)


def now() -> datetime:
    return datetime.now(UTC)
