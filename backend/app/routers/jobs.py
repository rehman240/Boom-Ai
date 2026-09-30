import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_owned_project
from app.jobs import expire_if_stale
from app.models import AiJob, Project
from app.schemas.job import JobOut

router = APIRouter(prefix="/projects/{project_id}/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> AiJob:
    """Polled by the page while a generation runs. A job from another campaign is a 404."""
    job = db.get(AiJob, job_id)
    if job is None or job.project_id != project.id:
        raise HTTPException(status_code=404, detail="Generation not found.")
    if expire_if_stale(db, job):
        db.commit()
    return job
