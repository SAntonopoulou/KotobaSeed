"""Database engine + session factory.

Driver picked automatically from `DATABASE_URL`. SQLite keeps the
`check_same_thread=False` arg so FastAPI's threaded request handlers work;
Postgres ignores it.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

_connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}

engine = create_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_pre_ping=True,
    connect_args=_connect_args,
)


def create_db_and_tables() -> None:
    """Idempotent schema bootstrap.

    Safe to call at startup. Once Alembic owns the schema, this becomes
    redundant for production but stays useful for tests.
    """
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
