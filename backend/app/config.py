"""Runtime configuration, all overridable by environment variable."""

from __future__ import annotations

import os
import secrets
import warnings
from dataclasses import dataclass, field

DEV_SECRET_SENTINEL = "dev-secret-change-me"


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    secret_key: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SECRET_KEY", DEV_SECRET_SENTINEL)
    )
    token_ttl_minutes: int = field(
        default_factory=lambda: int(os.environ.get("KANBUNNY_TOKEN_TTL_MINUTES", "720"))
    )
    algorithm: str = "HS256"

    #: The frontend dev server. Vite is configured to proxy /api, in which case these are unused,
    #: but allowing them means the frontend also works pointed straight at this service.
    cors_origins: list[str] = field(
        default_factory=lambda: _split(
            os.environ.get(
                "KANBUNNY_CORS_ORIGINS",
                "http://localhost:8080,http://localhost:8081,http://localhost:5173",
            )
        )
    )

    #: Credentials for the seeded demo account. See app/seed.py.
    seed_username: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SEED_USERNAME", "mila")
    )
    seed_password: str = field(
        default_factory=lambda: os.environ.get("KANBUNNY_SEED_PASSWORD", "carrots123")
    )

    def __post_init__(self) -> None:
        if self.secret_key == DEV_SECRET_SENTINEL:
            warnings.warn(
                "KANBUNNY_SECRET_KEY is unset, so tokens are signed with a well-known development "
                "secret. Anyone can mint a valid token. Set it before exposing this service.",
                RuntimeWarning,
                stacklevel=2,
            )


settings = Settings()


def random_secret() -> str:
    """A fresh signing key, for tests that should not share one."""
    return secrets.token_urlsafe(32)
