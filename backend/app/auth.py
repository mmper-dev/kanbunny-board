"""Users, password hashing, and bearer tokens.

Passwords are hashed with bcrypt and never stored or logged in the clear. Tokens are JWTs signed
with `KANBUNNY_SECRET_KEY`; the token carries the user id and nothing else worth stealing.

The user directory is in memory alongside the boards, so accounts vanish on restart along with
everything else. Only the hashing and verification would survive a move to a real database — the
`UserDirectory` API is deliberately narrow for that reason.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .errors import UnauthorizedError
from .store import next_id

# auto_error=False so a missing header raises our own 401 with the documented body, rather than
# Starlette's 403 with `{"detail": ...}` — which the frontend could not parse.
bearer_scheme = HTTPBearer(auto_error=False, description="Bearer token from POST /api/auth/login")


@dataclass
class User:
    id: str
    username: str
    password_hash: bytes


def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


def verify_password(password: str, password_hash: bytes) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash)
    except ValueError:
        # A malformed stored hash must read as "wrong password", never as a server error.
        return False


class UserDirectory:
    def __init__(self) -> None:
        self._users: dict[str, User] = {}
        self._lock = threading.RLock()

    def create(self, username: str, password: str) -> User:
        with self._lock:
            key = username.lower()
            if key in self._users:
                raise ValueError(f"User {username} already exists")
            user = User(
                id=next_id("U", (u.id for u in self._users.values())),
                username=username,
                password_hash=hash_password(password),
            )
            self._users[key] = user
            return user

    def by_username(self, username: str) -> User | None:
        with self._lock:
            return self._users.get(username.lower())

    def by_id(self, user_id: str) -> User | None:
        with self._lock:
            return next((u for u in self._users.values() if u.id == user_id), None)

    def authenticate(self, username: str, password: str) -> User:
        user = self.by_username(username)
        if user is None:
            # Hash anyway so a missing user and a wrong password take the same time, and neither
            # the message nor the timing says which one it was.
            hash_password(password)
            raise UnauthorizedError("That username and password do not match.")
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("That username and password do not match.")
        return user

    def reset(self) -> None:
        with self._lock:
            self._users.clear()


users = UserDirectory()


def issue_token(user: User) -> tuple[str, int]:
    """Returns the encoded token and its lifetime in seconds."""
    ttl = timedelta(minutes=settings.token_ttl_minutes)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return token, int(ttl.total_seconds())


def _decode(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("That session has expired. Sign in again.") from None
    except jwt.InvalidTokenError:
        raise UnauthorizedError("Sign in to see this board.") from None

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise UnauthorizedError("Sign in to see this board.")
    return subject


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """The authenticated caller, or a 401. Every /api data route depends on this."""
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Sign in to see this board.")

    user_id = _decode(credentials.credentials)
    user = users.by_id(user_id)
    if user is None:
        # Valid signature, but the account is gone — a restart wipes the directory.
        raise UnauthorizedError("That account no longer exists. Sign in again.")
    return user


CurrentUserDep = Annotated[User, Depends(current_user)]
