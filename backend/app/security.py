"""Password hashing and login session tokens."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher()
# Used when the email is unknown, so a failed login takes the same time either way.
_DUMMY_HASH = _hasher.hash("not-a-real-password")

_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Pass password_hash=None for an unknown email: still does the slow check, then returns False."""
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return password_hash is not None


class SessionClaims(NamedTuple):
    user_id: uuid.UUID
    session_version: int


def create_session_token(user_id: uuid.UUID, session_version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sv": session_version,
        "iat": now,
        "exp": now + timedelta(days=settings.session_days),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def read_session_token(token: str) -> SessionClaims | None:
    """Return the token's claims, or None if it is missing, expired or tampered with."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[_ALGORITHM])
        return SessionClaims(uuid.UUID(payload["sub"]), int(payload.get("sv", 0)))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None
