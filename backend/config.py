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
    # Postgres recommended; sqlite is fine for local + tests.
    database_url: str = "sqlite:///./database.db"
    db_echo: bool = False

    # ----- Redis ---------------------------------------------------------
    # Powers slowapi rate-limit storage (so limits survive a restart) and
    # the APScheduler signal bus when multiple workers run. Blank in dev
    # falls back to in-memory; both subsystems work either way.
    redis_url: str | None = None

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
    stripe_plus_annual_price_id: str | None = None
    stripe_pro_price_id: str | None = None
    stripe_pro_annual_price_id: str | None = None
    stripe_business_price_id: str | None = None
    stripe_business_annual_price_id: str | None = None
    # Minute pack top-ups — one-time charges that grant scheduled-minute
    # credit on top of the tier quota. Never expire.
    stripe_minute_pack_1k_price_id: str | None = None
    stripe_minute_pack_5k_price_id: str | None = None
    # Extra-seat add-on for Business — added as a SubscriptionItem on the
    # team owner's existing Business subscription with quantity = N.
    stripe_business_seat_price_id: str | None = None
    stripe_business_seat_annual_price_id: str | None = None
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
    # Release identifier — typically the git SHA, set by CI at build
    # time. Sentry uses this to attribute new errors to specific deploys
    # and to surface "regression since release X" insights.
    sentry_release: str | None = None

    # ----- Backups --------------------------------------------------------
    # Directory the SQLite snapshot cron writes to. Mounted volume in prod.
    backup_dir: str = "/data/backups"
    backup_retention_days: int = 30
    # Hard ceiling on the R2 bucket size in bytes — beyond this, uploads
    # are refused so a runaway DB can't blow the free tier. Default 7 GiB
    # leaves comfortable headroom under R2's 10 GB free quota. Local
    # backups continue regardless; only the offsite copy stops.
    r2_backup_quota_bytes: int = 7_516_192_768
    # Defense-in-depth cap on object count, in case the date-based prune
    # ever stops running. Older objects beyond this count get pruned even
    # if they're inside the retention window.
    r2_backup_max_objects: int = 60

    # ----- Classroom minute quotas (per User.subscription_tier) ----------
    # Monthly cap on confirmed-booking minutes per tutor. Daily.co charges
    # us per PARTICIPANT-minute, so a group class costs us 3-5× more per
    # scheduled minute than a 1:1. Quotas below are sized so the worst-
    # case "all group classes" usage still leaves a positive margin after
    # subscription revenue. Tutors who need more can buy MinutePack
    # top-ups (see backend/services/minute_quota.py).
    minute_quota_free: int = 240        # 4 hrs/mo — taster
    minute_quota_plus: int = 600        # 10 hrs/mo — light/student-side
    minute_quota_pro: int = 3000        # 50 hrs/mo — full-time tutor
    # Business is a TEAM tier — every seat on the team draws from one
    # shared monthly pool. Pool size = base (for the owner) plus per-seat
    # bonus for each additional active member. A 5-seat team:
    # 15000 + 4*3000 = 27000 min/mo (~450 hrs across 5 tutors).
    minute_quota_business: int = 15000       # base pool for the team owner
    minute_quota_business_per_seat: int = 3000  # per extra active seat

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
    # *.localhost port for dev AND any *.kotobaseed.net subdomain in prod —
    # the tutor SPA on a subdomain needs to reach api.kotobaseed.net with
    # credentials (the shared auth cookie), which requires a specific
    # Origin match (not a wildcard) in the CORS reply.
    cors_origin_regex: str = (
        r"^https?://([a-z0-9-]+\.)?localhost(:\d+)?$"
        r"|^https://([a-z0-9-]+\.)?kotobaseed\.net$"
    )

    # ----- Auth cookie ----------------------------------------------------
    # Shared session cookie scoped to .kotobaseed.net so signing in once
    # on the apex (or on any tutor subdomain) authenticates you across
    # every other subdomain. Cookie is HttpOnly + Secure + SameSite=Lax
    # in production. In dev the domain is None so the cookie is host-only
    # on localhost and shared across the Vite (5173) and uvicorn (8000)
    # ports (cookies ignore port).
    auth_cookie_name: str = "koto_token"
    auth_cookie_domain: str | None = None
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"

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

    # ----- Object storage (Cloudflare R2, S3-compatible) ------------------
    # Production default once Cloudflare R2 is enabled on the account.
    # When all of these are unset the storage facade falls back to the
    # local volume backend below, so uploads still work without R2.
    # R2 endpoint URL is derived from the account id:
    # https://<acct>.r2.cloudflarestorage.com
    r2_account_id: str | None = None
    r2_bucket: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    # Public base URL (with no trailing slash) where the bucket contents
    # are reachable on the web — either the default `pub-<hash>.r2.dev`
    # domain or a custom domain you've wired up in Cloudflare. The
    # backend stamps `<base>/<key>` into `User.avatar_url`.
    r2_public_url_base: str | None = None

    # ----- Local-volume storage (fallback while R2 isn't enabled) ----------
    # Backend writes uploads here and serves them through /uploads/*.
    # Mount this path as a Docker volume in production so files survive
    # container recreates. Defaults to /data/uploads inside the container.
    local_uploads_dir: str = "/data/uploads"

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
