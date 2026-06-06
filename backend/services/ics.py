"""Minimal RFC 5545 ICS generator for booking calendar export.

We hand-format VEVENT lines rather than pulling a heavyweight library —
the shape is small (UID, DTSTART, DTEND, SUMMARY, DESCRIPTION, URL) and
the rules for line endings + escaping are simple enough.

Apple Calendar, Google Calendar, Outlook all accept this output via the
.ics download flow.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def _ts(dt: datetime) -> str:
    """Format as a UTC compact timestamp."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str | None) -> str:
    """Escape ICS-specific characters per RFC 5545 §3.3.11."""
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def booking_to_ics(
    *,
    uid: str,
    summary: str,
    description: str | None,
    start: datetime,
    duration_minutes: int,
    url: str | None = None,
) -> str:
    """Return a complete VCALENDAR string with one VEVENT inside."""
    end = start + timedelta(minutes=duration_minutes)
    now = datetime.now(UTC)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kotobaseed//Lessons//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{_escape(uid)}",
        f"DTSTAMP:{_ts(now)}",
        f"DTSTART:{_ts(start)}",
        f"DTEND:{_ts(end)}",
        f"SUMMARY:{_escape(summary)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_escape(description)}")
    if url:
        lines.append(f"URL:{url}")
    lines += ["END:VEVENT", "END:VCALENDAR", ""]
    # CRLF line endings per spec — most parsers accept LF too but spec
    # demands CRLF.
    return "\r\n".join(lines)
