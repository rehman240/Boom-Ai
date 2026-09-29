from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.events import track
from app.models import User
from app.rate_limit import rate_limit
from app.schemas.auth import LoginIn, SignupIn, UserOut
from app.security import hash_password, verify_password
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
