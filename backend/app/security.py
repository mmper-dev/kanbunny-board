"""Password hashing.

Separated from `auth.py` so the store implementations can hash without importing the FastAPI
layer, and so the crypto has one home if it ever needs changing (bcrypt -> argon2, say).
"""

from __future__ import annotations

import bcrypt


def hash_password(password: str) -> bytes:
    """bcrypt with a fresh per-password salt, so equal passwords do not produce equal hashes."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


def verify_password(password: str, password_hash: bytes) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash)
    except ValueError:
        # A malformed stored hash must read as "wrong password", never as a server error.
        return False
