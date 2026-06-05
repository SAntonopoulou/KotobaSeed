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
    platform_fee_percent: float = 0.15

    # ----- Frontend -------------------------------------------------------
    frontend_url: str = "http://localhost:5173"

    # ----- CORS -----------------------------------------------------------
    # Comma-separated list in env; parsed into a tuple at use time.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ----- Bootstrap admin (optional, dev convenience) --------------------
    admin_email: str | None = None
    admin_password: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance. First call validates required env vars."""
    return Settings()  # type: ignore[call-arg]


# Convenience export so existing code that imports `settings` keeps working.
settings = get_settings()
