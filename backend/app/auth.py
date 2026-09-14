"""Bearer tokens and the route guard.

Password hashing lives in `security.py`; the user records live in whichever store is configured.
This module is only about turning a credential into a token, and a token back into a user.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .errors import UnauthorizedError
from .store import User, get_user_store

# auto_error=False so a missing header raises our own 401 with the documented body, rather than
# Starlette's 403 with `{"detail": ...}`, which the frontend could not parse.
bearer_scheme = HTTPBearer(auto_error=False, description="Bearer token from POST /api/auth/login")


def issue_token(user: User) -> tuple[str, int]:
    """Returns the encoded token and its lifetime in seconds."""
    ttl = timedelta(minutes=settings.token_ttl_minutes)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm), int(
        ttl.total_seconds()
    )


def _subject(token: str) -> str:
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

    user = get_user_store().by_id(_subject(credentials.credentials))
    if user is None:
        # Valid signature, but the account is gone — in memory mode a restart wipes them.
        raise UnauthorizedError("That account no longer exists. Sign in again.")
    return user


CurrentUserDep = Annotated[User, Depends(current_user)]
