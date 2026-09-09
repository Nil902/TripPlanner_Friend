"""
Authentication and security helpers for password hashing and token management.
"""

import base64
import hashlib
import hmac
import os
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.config import settings
from app.core.db import get_session

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a unique random salt."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}:{key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored salt and key."""
    try:
        salt_hex, key_hex = hashed_password.split(":")
        salt = bytes.fromhex(salt_hex)
        key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt, 100_000
        )
        return hmac.compare_digest(key, new_key)
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    """Create a signed, tamper-proof bearer token with expiration timestamp."""
    expires_at = int(time.time()) + (settings.TOKEN_EXPIRE_HOURS * 3600)
    payload = f"{user_id}:{expires_at}"
    sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("utf-8")


def decode_access_token(token: str) -> str | None:
    """Verify signature and expiration, returning user_id if valid."""
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        # Use maxsplit=2 so that a user_id containing ":" (e.g. future formats)
        # does not corrupt the parse. We always expect exactly 3 fields:
        # user_id, expires_at (unix timestamp), and HMAC-SHA256 hex signature.
        parts = raw.split(":", maxsplit=2)
        if len(parts) != 3:
            return None
        user_id, expires_str, sig = parts
        payload = f"{user_id}:{expires_str}"
        expected_sig = hmac.new(
            settings.SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        if int(expires_str) < int(time.time()):
            return None
        return user_id
    except Exception:
        return None


def get_current_user_optional(
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
):
    """Optionally get the current user if token provided, else None."""
    from app.models.schema import User

    if not auth or not auth.credentials:
        return None
    user_id = decode_access_token(auth.credentials)
    if not user_id:
        return None
    return session.get(User, user_id)


def get_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
):
    """Enforce authenticated user via bearer token."""
    from app.models.schema import User

    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Authentication token required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = decode_access_token(auth.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User account does not exist"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_admin_user(
    current_user=Depends(get_current_user),
):
    """Enforce authenticated user with administrator privileges."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Access denied. Administrator privileges required.",
            },
        )
    return current_user
