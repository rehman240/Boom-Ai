import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_editable_project, get_owned_project
from app.events import track
from app.models import Project, Upload
from app.schemas.upload import UploadOut
from app.storage import Storage, StorageError, get_storage, storage_error
from app.uploads import ALLOWED_TYPES, INLINE_TYPES, KINDS, MAX_FILES_PER_PROJECT, check_file, safe_filename

router = APIRouter(prefix="/projects/{project_id}/uploads", tags=["uploads"])


def _owned_upload(upload_id: uuid.UUID, project: Project, db: Session) -> Upload:
    upload = db.get(Upload, upload_id)
    if upload is None or upload.project_id != project.id:
        raise HTTPException(status_code=404, detail="File not found.")
    return upload


@router.get("", response_model=list[UploadOut])
def list_uploads(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> list[Upload]:
    return list(
        db.scalars(select(Upload).where(Upload.project_id == project.id).order_by(Upload.created_at)).all()
    )


@router.post("", response_model=UploadOut, status_code=201)
async def add_upload(
    file: UploadFile = File(...),
    kind: str = Form("reference"),
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> Upload:
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail="Unknown file kind.")

    settings = get_settings()
    max_bytes = settings.upload_max_mb * 1024 * 1024
    # Read one byte past the limit: enough to reject an oversized file without holding it.
    data = await file.read(max_bytes + 1)
    content_type = check_file(data, max_bytes)

    count = db.scalar(select(func.count()).select_from(Upload).where(Upload.project_id == project.id)) or 0
    replacing = (
        db.scalar(select(Upload).where(Upload.project_id == project.id, Upload.kind == "logo"))
        if kind == "logo"
        else None
    )
    if count >= MAX_FILES_PER_PROJECT and replacing is None:
        raise HTTPException(
            status_code=409, detail=f"A campaign can hold {MAX_FILES_PER_PROJECT} files. Remove one first."
        )

    # The key is ours, never the uploader's filename: that keeps paths out of their hands.
    key = f"projects/{project.id}/{uuid.uuid4().hex}{ALLOWED_TYPES[content_type]}"
    try:
        storage.save(key, data, content_type)
    except StorageError:
        raise storage_error() from None

    # Only one logo per campaign: the new one replaces the old.
    if replacing is not None:
        old_key = replacing.storage_key
        db.delete(replacing)
        db.flush()
        try:
            storage.delete(old_key)
        except StorageError:
            pass  # the row is gone; a stray object is not worth failing the upload for

    upload = Upload(
        project_id=project.id,
        kind=kind,
        original_filename=safe_filename(file.filename),
        content_type=content_type,
        size_bytes=len(data),
        storage_key=key,
    )
    db.add(upload)
    project.updated_at = func.now()
    track(db, "file_uploaded", user_id=project.owner_id, project_id=project.id)
    db.commit()
    db.refresh(upload)
    return upload


@router.get("/{upload_id}/file")
def download_upload(
    upload_id: uuid.UUID,
    project: Project = Depends(get_owned_project),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> Response:
    """Files are private, so they are streamed to their owner rather than linked publicly."""
    upload = _owned_upload(upload_id, project, db)
    try:
        data = storage.read(upload.storage_key)
    except StorageError:
        raise HTTPException(status_code=404, detail="File not found.") from None

    disposition = "inline" if upload.content_type in INLINE_TYPES else "attachment"
    return Response(
        content=data,
        media_type=upload.content_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{upload.original_filename}"',
            # Never let a browser guess a different, possibly executable, type.
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.delete("/{upload_id}", status_code=204)
def delete_upload(
    upload_id: uuid.UUID,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> None:
    upload = _owned_upload(upload_id, project, db)
    key = upload.storage_key
    db.delete(upload)
    project.updated_at = func.now()
    db.commit()
    try:
        storage.delete(key)
    except StorageError:
        pass  # the row is already gone; the object is cleaned up with the campaign
