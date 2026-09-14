"""Store selection.

`KANBUNNY_STORE` picks the implementation:

    database   persist to DATABASE_URL (default; SQLite out of the box)
    memory     keep everything in process, demo mode, nothing survives a restart

Nothing outside this package knows which one is in use. Routers and `auth.py` depend on the
protocols in `base.py`, and get a concrete store from `get_board_store()` / `get_user_store()`.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import STORE_MEMORY, Settings, settings as default_settings
from .base import BoardStore, UserStore
from .common import User, assert_acyclic, next_id
from .memory import MemoryBoardStore, MemoryUserStore

__all__ = [
    "BoardStore",
    "UserStore",
    "User",
    "Stores",
    "assert_acyclic",
    "next_id",
    "build_stores",
    "configure",
    "get_board_store",
    "get_user_store",
    "describe",
]


@dataclass
class Stores:
    boards: BoardStore
    users: UserStore
    #: Human-readable, for the startup banner and the /health payload.
    description: str


def build_stores(config: Settings | None = None) -> Stores:
    config = config or default_settings

    if config.store == STORE_MEMORY:
        return Stores(
            boards=MemoryBoardStore(),
            users=MemoryUserStore(),
            description="in-memory (demo mode — nothing persists)",
        )

    # Imported lazily so the memory-only path never needs SQLAlchemy loaded.
    from ..db import create_database_engine, make_session_factory
    from .sql import SqlBoardStore, SqlUserStore

    engine = create_database_engine(config.database_url, echo=config.echo_sql)
    sessions = make_session_factory(engine)
    return Stores(
        boards=SqlBoardStore(sessions),
        users=SqlUserStore(sessions),
        description=f"database ({engine.url.render_as_string(hide_password=True)})",
    )


_stores: Stores | None = None


def configure(config: Settings | None = None) -> Stores:
    """Build the stores and make them the process-wide pair. Called at startup, and by tests."""
    global _stores
    _stores = build_stores(config)
    return _stores


def _active() -> Stores:
    global _stores
    if _stores is None:
        _stores = build_stores()
    return _stores


def get_board_store() -> BoardStore:
    return _active().boards


def get_user_store() -> UserStore:
    return _active().users


def describe() -> str:
    return _active().description
