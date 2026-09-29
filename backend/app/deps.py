"""Shared route dependencies."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.security import read_session_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    claims = read_session_token(token) if token else None
    user = db.get(User, claims.user_id) if claims else None
    # A token from before the last password change carries an older version.
    if user is None or claims.session_version != user.session_version:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return user
