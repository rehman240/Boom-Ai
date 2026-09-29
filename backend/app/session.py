"""The login cookie. Shared by the auth and account routes so both set it the same way."""

from fastapi import Response

from app.config import get_settings
from app.models import User
from app.security import create_session_token


def set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        create_session_token(user.id, user.session_version),
        max_age=settings.session_days * 24 * 3600,
        httponly=True,  # not readable from JavaScript
        secure=settings.is_production,  # HTTPS only in production
        samesite="lax",  # not sent on cross-site form posts
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name, path="/", httponly=True, secure=settings.is_production, samesite="lax"
    )
