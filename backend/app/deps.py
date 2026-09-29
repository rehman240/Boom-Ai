"""Shared route dependencies."""

import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Project, User
from app.security import read_session_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    claims = read_session_token(token) if token else None
    user = db.get(User, claims.user_id) if claims else None
    # A token from before the last password change carries an older version.
    if user is None or claims.session_version != user.session_version:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return user


def get_owned_project(
    project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Project:
    """The user's project, or 404. Someone else's project is also 404, so ids don't leak."""
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return project


def get_editable_project(project: Project = Depends(get_owned_project)) -> Project:
    if project.is_demo:
        raise HTTPException(status_code=403, detail="The example campaign is read-only. Duplicate it to make changes.")
    return project
