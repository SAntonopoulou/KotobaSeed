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
    # Stripe price IDs for the platform subscription tiers (Plus / Pro /
    # Business). Free is the default — no Stripe product needed. Prices are
    # immutable in Stripe; to change a price create a new one and rotate the
    # env var.
    stripe_plus_price_id: str | None = None
    stripe_pro_price_id: str | None = None
    stripe_business_price_id: str | None = None
    # Legacy: kept for the old CompInput Premium tier. Not used in the unified
    # pricing model; safe to remove after we're confident no stale env values
    # are referencing it.
    stripe_premium_price_id: str | None = None
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
    # Rolling reserve: how many days Stripe holds a payment before paying
    # the tutor out. 14 days is industry-standard for new marketplaces — it
    # gives us a buffer against chargebacks and refunds. Set to 0 to disable
    # the delay (legacy behaviour).
    connect_payout_delay_days: int = 14

    # ----- Classroom ------------------------------------------------------
    # Cloud recording (Daily.co Premium). When True, every new classroom
    # room has cloud-recording enabled — the tutor can press record from
    # the in-call UI to capture the session for later download. Defaults
    # off so accidental Premium-tier charges don't sneak in pre-launch.
    classroom_enable_recording: bool = False

    # ----- Observability --------------------------------------------------
    # SENTRY_DSN absent → no Sentry SDK init; SDK calls are no-ops.
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    # ----- Backups --------------------------------------------------------
    # Directory the SQLite snapshot cron writes to. Mounted volume in prod.
    backup_dir: str = "/data/backups"
    backup_retention_days: int = 30

    # ----- Scheduled jobs -------------------------------------------------
    # Disable in test/dev if needed by setting `scheduler_enabled=false`.
    scheduler_enabled: bool = True
    # Days of no completed lessons before a Starter tutor is auto-paused.
    dormant_pause_days: int = 30
    # Hour (UTC) when the daily dormant-pause sweep runs.
    dormant_check_hour_utc: int = 4

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

    # ----- Custom domains -------------------------------------------------
    # IP that Pro/Business tutors should point their A record at. When set,
    # the verify endpoint resolves the tutor's domain and confirms it
    # matches this IP. Unset locally — dev environments set
    # `custom_domain_auto_verify=true` instead.
    kotobaseed_server_ip: str | None = None
    # Dev short-circuit: skip the DNS lookup and mark domains as verified
    # immediately so Sophia can exercise the UX flow without real DNS.
    custom_domain_auto_verify: bool = False

    # ----- Classroom video (Daily.co) -------------------------------------
    # Unset is fine — the classroom endpoint returns 503 with a clear
    # message so the rest of the platform keeps working in environments
    # that haven't wired it yet.
    daily_api_key: str | None = None
    # Subdomain on Daily.co (e.g. "kotobaseed" for kotobaseed.daily.co).
    # Used only for constructing URLs — Daily's API tells us the URL too,
    # so this is a hint, not load-bearing.
    daily_domain: str | None = None
    # How many minutes before scheduled_at a student/tutor can join.
    classroom_join_lead_minutes: int = 15
    # Grace period after scheduled_at + duration for re-joining (e.g. after
    # a disconnect). The room itself expires shortly after.
    classroom_join_grace_minutes: int = 30


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance. First call validates required env vars."""
    return Settings()  # type: ignore[call-arg]


# Convenience export so existing code that imports `settings` keeps working.
settings = get_settings()
