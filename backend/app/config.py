"""Runtime configuration.

Read from the environment, and from a `.env` file beside `pyproject.toml` if one exists. See
`.env.example` for every knob and its default.
"""

from __future__ import annotations

import os
import secrets
import warnings
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# `override=False` so a real environment variable always beats the file — important in CI and in
# containers, where .env may be baked into the image but the environment is the truth.
load_dotenv(BACKEND_ROOT / ".env", override=False)

DEV_SECRET_SENTINEL = "dev-secret-change-me"

#: Keep everything in process, seeded with demo data and wiped on restart. This is the mode that
#: needs no database at all — handy for demos, and what the test suite uses.
STORE_MEMORY = "memory"
#: Persist to whatever DATABASE_URL points at.
STORE_DATABASE = "database"


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    # --- storage ---------------------------------------------------------------------------
    #: "database" (default) or "memory".
    store: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_STORE", STORE_DATABASE).strip().lower()
    )
    #: Any SQLAlchemy URL. SQLite by default; `postgresql+psycopg://user:pass@host/db` works the
    #: same way once that driver is installed. Ignored when store == "memory".
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL", f"sqlite:///{(BACKEND_ROOT / 'kanbunny.db').as_posix()}"
        )
    )
    echo_sql: bool = field(default_factory=lambda: _flag("KANBUNNY_ECHO_SQL", False))

    #: Create the demo account and its board at startup if it is not already there.
    seed_demo: bool = field(default_factory=lambda: _flag("KANBUNNY_SEED_DEMO", True))

    # --- auth ------------------------------------------------------------------------------
    secret_key: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SECRET_KEY", DEV_SECRET_SENTINEL)
    )
    token_ttl_minutes: int = field(
        default_factory=lambda: int(os.environ.get("KANBUNNY_TOKEN_TTL_MINUTES", "720"))
    )
    algorithm: str = "HS256"

    # --- http ------------------------------------------------------------------------------
    #: Only consulted when the browser talks to this service directly. With the Vite proxy the
    #: browser thinks everything is same-origin and CORS never comes up.
    cors_origins: list[str] = field(
        default_factory=lambda: _split(
            os.environ.get(
                "KANBUNNY_CORS_ORIGINS",
                "http://localhost:8080,http://localhost:8081,http://localhost:5173",
            )
        )
    )

    # --- demo account ----------------------------------------------------------------------
    seed_username: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SEED_USERNAME", "mila")
    )
    seed_password: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SEED_PASSWORD", "carrots123")
    )

    def __post_init__(self) -> None:
        if self.store not in (STORE_MEMORY, STORE_DATABASE):
            raise ValueError(
                f"KANBUNNY_STORE must be {STORE_MEMORY!r} or {STORE_DATABASE!r}, "
                f"not {self.store!r}"
            )
        if self.secret_key == DEV_SECRET_SENTINEL:
            warnings.warn(
                "KANBUNNY_SECRET_KEY is unset, so tokens are signed with a well-known development "
                "secret. Anyone can mint a valid token. Set it before exposing this service.",
                RuntimeWarning,
                stacklevel=2,
            )

    @property
    def uses_database(self) -> bool:
        return self.store == STORE_DATABASE


settings = Settings()


def random_secret() -> str:
    """A fresh signing key, for tests that should not share one."""
    return secrets.token_urlsafe(32)
