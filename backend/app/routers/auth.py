from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brand import APP_NAME
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.events import track
from app.mail import Mailer, get_mailer
from app.models import User
from app.rate_limit import rate_limit
from app.schemas.auth import ForgotPasswordIn, LoginIn, ResetPasswordIn, SignupIn, UserOut
from app.security import (
    create_reset_token,
    hash_password,
    password_fingerprint,
    read_reset_token,
    verify_password,
)
from app.session import clear_session_cookie, set_session_cookie

router = APIRouter(prefix="/auth", tags=["auth"])

auth_limit = Depends(rate_limit(get_settings().rate_limit_auth))


@router.post("/signup", response_model=UserOut, status_code=201, dependencies=[auth_limit])
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)) -> User:
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(email=body.email, password_hash=hash_password(body.password))
    if body.workspace_name and body.workspace_name.strip():
        user.workspace_name = body.workspace_name.strip()
    db.add(user)
    db.flush()
    track(db, "signup", user_id=user.id)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/login", response_model=UserOut, dependencies=[auth_limit])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    track(db, "login", user_id=user.id)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


# The same answer whether or not the email has an account, so the form can't be used to find out.
RESET_SENT = "If an account uses that email, we've sent a link to reset the password. It works for one hour."
RESET_INVALID = "This reset link has expired or was already used. Ask for a new one."


def _reset_email(link: str) -> str:
    minutes = get_settings().reset_token_minutes
    return (
        "Hello,\n\n"
        f"Someone asked to reset the password for your {APP_NAME} account. "
        f"To choose a new password, open this link (it works once, for {minutes} minutes):\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email. Your password stays the same.\n\n"
        f"{APP_NAME}\n"
    )


def reset_available() -> bool:
    """A reset email can reach the user: SMTP is set up, or this is development (it is logged)."""
    settings = get_settings()
    return bool(settings.smtp_host) or not settings.is_production


@router.get("/options")
def auth_options() -> dict[str, bool]:
    """What the sign-in pages may offer. "Forgot password?" is hidden until email works."""
    return {"password_reset": reset_available()}


@router.post("/forgot-password", status_code=202, dependencies=[auth_limit])
def forgot_password(
    body: ForgotPasswordIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    mailer: Mailer = Depends(get_mailer),
) -> dict[str, str]:
    if not reset_available():
        raise HTTPException(status_code=503, detail="Password reset by email isn't available yet.")
    user = db.scalar(select(User).where(User.email == body.email))
    if user is not None:
        token = create_reset_token(user.id, user.password_hash)
        # In the fragment, not the query, so the token never reaches a server log or a Referer.
        link = f"{get_settings().app_url.rstrip('/')}/reset-password#token={token}"
        # Sent after the answer, so the response time doesn't show whether the account exists.
        background.add_task(mailer.send, user.email, f"Reset your {APP_NAME} password", _reset_email(link))
        track(db, "password_reset_requested", user_id=user.id)
        db.commit()
    return {"detail": RESET_SENT}


@router.post("/reset-password", response_model=UserOut, dependencies=[auth_limit])
def reset_password(body: ResetPasswordIn, response: Response, db: Session = Depends(get_db)) -> User:
    claims = read_reset_token(body.token)
    user = db.get(User, claims[0]) if claims else None
    if user is None or password_fingerprint(user.password_hash) != claims[1]:
        raise HTTPException(status_code=400, detail=RESET_INVALID)
    user.password_hash = hash_password(body.password)
    # Signs out every device, including whoever knew the old password. This one signs in below.
    user.session_version += 1
    track(db, "password_reset", user_id=user.id)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user)
    return user
