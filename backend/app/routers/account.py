import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.brand import APP_SLUG
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.events import track
from app.models import Brief, Project, Upload, User
from app.rate_limit import rate_limit
from app.schemas.account import AccountDelete, EmailChange, PasswordChange, WorkspaceUpdate
from app.schemas.auth import UserOut
from app.security import hash_password, verify_password
from app.session import clear_session_cookie, set_session_cookie

router = APIRouter(prefix="/account", tags=["account"])

# Anything that takes a password is a place to guess one, so it gets the login limit.
password_limit = Depends(rate_limit(get_settings().rate_limit_auth))

WRONG_PASSWORD = HTTPException(status_code=401, detail="That password is incorrect.")


def _columns(model: type, skip: set[str]) -> list[str]:
    return [c.key for c in inspect(model).mapper.column_attrs if c.key not in skip]


@router.patch("", response_model=UserOut)
def update_workspace(
    body: WorkspaceUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    user.workspace_name = body.workspace_name
    db.commit()
    db.refresh(user)
    return user


@router.post("/email", response_model=UserOut, dependencies=[password_limit])
def change_email(
    body: EmailChange,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not verify_password(body.password, user.password_hash):
        raise WRONG_PASSWORD
    if body.email != user.email and db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user.email = body.email
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user)
    return user


@router.post("/password", status_code=204, dependencies=[password_limit])
def change_password(
    body: PasswordChange,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise WRONG_PASSWORD
    user.password_hash = hash_password(body.new_password)
    # Signs out every other device. The cookie below keeps this one signed in.
    user.session_version += 1
    track(db, "password_changed", user_id=user.id)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user)


@router.get("/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    """Everything this account holds, as one JSON file. Never includes the password hash."""
    projects = db.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.created_at)).all()
    project_ids = [p.id for p in projects]
    briefs = {
        b.project_id: b
        for b in (db.scalars(select(Brief).where(Brief.project_id.in_(project_ids))).all() if project_ids else [])
    }
    uploads: dict = {}
    if project_ids:
        for u in db.scalars(select(Upload).where(Upload.project_id.in_(project_ids))).all():
            uploads.setdefault(u.project_id, []).append(u)

    project_fields = _columns(Project, {"owner_id"})
    brief_fields = _columns(Brief, {"project_id"})
    # File contents live in private storage; the export lists what was uploaded.
    upload_fields = _columns(Upload, {"project_id", "storage_key"})

    payload = {
        "exported_at": datetime.now(UTC),
        "account": {"email": user.email, "workspace_name": user.workspace_name, "created_at": user.created_at},
        "campaigns": [
            {
                **{f: getattr(p, f) for f in project_fields},
                "brief": (
                    {f: getattr(briefs[p.id], f) for f in brief_fields} if p.id in briefs else None
                ),
                "uploads": [{f: getattr(u, f) for f in upload_fields} for u in uploads.get(p.id, [])],
            }
            for p in projects
        ],
    }

    track(db, "data_exported", user_id=user.id)
    db.commit()

    filename = f"{APP_SLUG}-export-{datetime.now(UTC):%Y-%m-%d}.json"
    return Response(
        content=json.dumps(jsonable_encoder(payload), indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# A POST, not a DELETE: this one carries a body, and not every proxy forwards a DELETE body.
@router.post("/delete", status_code=204, dependencies=[password_limit])
def delete_account(
    body: AccountDelete,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(body.password, user.password_hash):
        raise WRONG_PASSWORD
    # Campaigns, briefs, uploads and jobs go with the account (ON DELETE CASCADE).
    db.delete(user)
    track(db, "account_deleted")
    db.commit()
    clear_session_cookie(response)
