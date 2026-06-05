"""Alembic environment for Kotobaseed.

Reads DATABASE_URL from `backend.config.settings` (env-driven), and pulls
the metadata from SQLModel.metadata so autogenerate works against every
model defined in `backend.models`.
"""
# ruff: noqa: E402  (sys.path setup must happen before backend imports)

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

# Make `backend.*` imports work whether alembic is invoked from project root
# or from the backend/ directory.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# Ensure all models are imported so SQLModel.metadata is populated before
# autogenerate runs.
from backend import models  # noqa: F401, E402
from backend.config import settings  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the live DATABASE_URL from settings.
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (emits SQL only)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
