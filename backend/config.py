"""Centralized application configuration.

Reads from environment via pydantic-settings (with .env file support).
Critical secrets have no fallback values — startup fails loudly if they're
missing, rather than silently running with insecure defaults.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ----- Environment -----------------------------------------------------
    environment: Literal["dev", "test", "staging", "production"] = "dev"

    # ----- Database -------------------------------------------------------
    # Postgres recommended; sqlite is fine for local + tests
    database_url: str = "sqlite:///./database.db"
    db_echo: bool = False

    # ----- Auth -----------------------------------------------------------
    # No default — must be set in env. Crashes on startup if missing.
    secret_key: str = Field(..., description="JWT signing key. Required.")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # ----- Stripe ---------------------------------------------------------
    stripe_secret_key: str = Field(..., description="Stripe secret key. Required.")
    stripe_webhook_secret: str = Field(..., description="Stripe webhook signing secret. Required.")
    stripe_plus_price_id: str | None = None
    stripe_premium_price_id: str | None = None
    # Kotobaseed Pro plan — €35/mo flat, the only platform-level subscription.
    # Starter (€0/mo + 5% rev share) needs no Stripe product; the 5% comes
    # from Application Fees on tutor-to-student transactions.
    stripe_pro_price_id: str | None = None
    platform_fee_percent: float = 0.15

    # ----- Frontend -------------------------------------------------------
    frontend_url: str = "http://localhost:5173"

    # ----- Stripe Connect onboarding URLs ---------------------------------
    # Where Stripe redirects the tutor after onboarding (success or aborted).
    # Stripe re-issues fresh AccountLinks each time so these don't carry
    # tokens — safe to be static per-environment.
    connect_onboarding_return_url: str = "http://localhost:5173/onboarding/return"
    connect_onboarding_refresh_url: str = "http://localhost:5173/onboarding/refresh"
    # Stripe Connect Express country (ISO-2). Tutors based elsewhere need to
    # set this per-account during onboarding — handled when we add country
    # selection to the signup form.
    default_connect_country: str = "GR"

    # ----- CORS -----------------------------------------------------------
    # Exact-match origins (comma-separated). Use the regex below for patterns
    # like wildcard subdomains.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    # Regex applied in addition to cors_origins. Default matches any
    # *.localhost port for dev — `vasso.localhost:5173`, `test.localhost:5173`,
    # etc. — so tenant subdomains in dev mirror prod without per-tutor config.
    cors_origin_regex: str = r"^https?://([a-z0-9-]+\.)?localhost(:\d+)?$"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ----- Multi-tenant routing -------------------------------------------
    # The bare apex host means "no tenant" (marketing site + marketplace).
    platform_apex: str = "kotobaseed.net"
    # What we strip off the Host to get a slug. Separate from `platform_apex`
    # so staging can use e.g. `.staging.kotobaseed.net` without changing the
    # apex semantics.
    tenant_subdomain_suffix: str = ".kotobaseed.net"
    # Subdomains that always resolve to "no tenant" even if a tutor claims
    # the slug. Signup validation should reject these too (later step).
    reserved_subdomains: str = "www,api,admin"
    # Header used to override tenant resolution in dev/test. Ignored unless
    # `environment` is "dev" or "test".
    tenant_dev_override_header: str = "X-Tenant-Slug"

    @property
    def reserved_subdomain_set(self) -> frozenset[str]:
        return frozenset(s.strip().lower() for s in self.reserved_subdomains.split(",") if s.strip())

    # ----- Bootstrap admin (optional, dev convenience) --------------------
    admin_email: str | None = None
    admin_password: str | None = None

    # ----- Email (Resend) -------------------------------------------------
    # Unset is fine for local dev — email helpers no-op with a log line.
    resend_api_key: str | None = None
    resend_from_email: str = "noreply@kotobaseed.net"
    resend_from_name: str = "Kotobaseed"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance. First call validates required env vars."""
    return Settings()  # type: ignore[call-arg]


# Convenience export so existing code that imports `settings` keeps working.
settings = get_settings()
