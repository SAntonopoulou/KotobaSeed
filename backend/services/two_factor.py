"""TOTP-based 2FA.

Users opt in via /auth/2fa/setup → receives a QR-code provisioning URI →
verifies the first code via /auth/2fa/verify-setup → 2FA is now active.

On subsequent logins, /auth/login returns `requires_2fa: true` instead of
a token; the client posts to /auth/login/2fa with the TOTP code.

Secrets live on User.totp_secret (Argon2-style hash NOT applied — TOTP
secrets are designed to be readable for verification, so they're stored
as base32). The User must enable account-level encryption for at-rest
protection in prod.
"""

from __future__ import annotations

import secrets

import pyotp


def generate_secret() -> str:
    """A fresh base32 TOTP secret."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_email: str, issuer: str = "Kotobaseed") -> str:
    """The otpauth:// URI the authenticator app encodes as a QR."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=account_email, issuer_name=issuer)


def verify(secret: str, code: str) -> bool:
    """Constant-time check a 6-digit TOTP code. Allows a 30-second window
    on either side to absorb clock drift."""
    if not secret or not code:
        return False
    try:
        totp = pyotp.TOTP(secret)
        return bool(totp.verify(code.strip(), valid_window=1))
    except Exception:
        return False


def new_recovery_codes(n: int = 6) -> list[str]:
    """Single-use backup codes for when the authenticator app is lost.
    Stored hashed on User; on use, the matching code is invalidated."""
    return [secrets.token_hex(4).upper() for _ in range(n)]
