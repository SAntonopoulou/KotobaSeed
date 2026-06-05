"""Custom-domain verification.

Pro/Business tutors point an A record at the platform server IP. The
verify endpoint resolves the domain and compares the result to
`settings.kotobaseed_server_ip`. If they match, we stamp
`tutor.custom_domain_verified_at` and the tenancy middleware will start
honouring the Host header.

Dev mode short-circuit: `custom_domain_auto_verify=true` skips the DNS
check entirely so Sophia can exercise the UX flow on localhost without
real DNS records.

Uses `socket.gethostbyname` rather than dnspython — it's stdlib, respects
the system resolver, and is enough for an A-record check.
"""

from __future__ import annotations

import logging
import re
import socket

from ..config import settings

log = logging.getLogger(__name__)


# RFC 1035-ish — labels of letters/digits/hyphens, separated by dots.
# Permissive on length (DNS allows 253 chars) and rejects trailing dots,
# embedded whitespace, and protocol prefixes. We lowercase before checking.
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$"
)


class DomainValidationError(ValueError):
    """Bad domain string — surface to the user with a useful message."""


def normalize_domain(raw: str) -> str:
    """Lowercase, strip protocol prefix, strip trailing slash, strip whitespace.

    Raises DomainValidationError on anything that doesn't look like a real
    apex/subdomain. We don't try to detect public-suffix nonsense (e.g. a
    tutor claiming `.com`) — the verify step will fail if their A record
    doesn't resolve to us anyway.
    """
    d = (raw or "").strip().lower()
    if d.startswith(("http://", "https://")):
        d = d.split("://", 1)[1]
    d = d.split("/", 1)[0]  # drop any path
    d = d.rstrip(".")
    if not d:
        raise DomainValidationError("Domain is empty.")
    # Reject the platform's own domain so a tutor can't claim it.
    apex = settings.platform_apex.lower()
    if d == apex or d.endswith("." + apex):
        raise DomainValidationError(
            "Use your subdomain on kotobaseed.net for free — custom domains "
            "are for domains you own elsewhere."
        )
    if not _DOMAIN_RE.match(d):
        raise DomainValidationError(
            "That doesn't look like a valid domain (try e.g. 'mygreeksite.com')."
        )
    return d


def expected_target_ip() -> str | None:
    """Return the IP tutors should point their A record at, or None when
    the platform hasn't been configured yet."""
    return settings.kotobaseed_server_ip


def resolve_a_record(domain: str) -> str | None:
    """Look up the IPv4 A record for `domain`. Returns None on failure
    rather than raising so the caller can render a clean status."""
    try:
        return socket.gethostbyname(domain)
    except OSError as exc:
        log.info("DNS lookup failed for %s: %s", domain, exc)
        return None


def verify_domain_dns(domain: str) -> bool:
    """True iff the domain's A record resolves to the platform IP. In dev
    with `custom_domain_auto_verify=true`, returns True unconditionally."""
    if settings.custom_domain_auto_verify:
        return True
    target = expected_target_ip()
    if not target:
        log.warning(
            "Custom-domain verify called but kotobaseed_server_ip is not set."
        )
        return False
    resolved = resolve_a_record(domain)
    if resolved is None:
        return False
    return resolved == target
