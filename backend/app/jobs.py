"""Background AI jobs, kept in the ai_jobs table so they survive a page refresh.

A route creates the job row and hands `run_job` to FastAPI's background tasks; the page
then polls the job by id. The runner only needs a job id, a way to open a database
session and a provider, so it can move to a separate worker process later unchanged.

A job left queued or running for too long (the server restarted mid-way, say) is marked
failed the next time anyone looks at it, so the user can retry instead of waiting forever.
A failed job never touches the user's existing work: results are written only on success.
"""

import logging
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import brief_summary
from app.ai.provider import AiError, AiProvider
from app.config import get_settings
from app.db import SessionLocal
from app.events import track
from app.models import AiJob, Brief, JobKind, JobStatus, Project

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 2  # one automatic retry for a transient failure or a malformed answer
ACTIVE = (JobStatus.QUEUED, JobStatus.RUNNING)
STALE_MESSAGE = "This took too long and was stopped. Please try again."
UNEXPECTED_MESSAGE = "Something went wrong while generating. Please try again."


@dataclass(frozen=True)
class JobHandler:
    # Calls the model. Runs outside any database transaction.
    run: Callable[[AiProvider, dict[str, Any]], dict[str, Any]]
    # Saves a successful result. Runs in the same transaction that marks the job done.
    apply: Callable[[Session, AiJob, dict[str, Any], AiProvider], None]
    prompt_version: str


def _run_brief_summary(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    return brief_summary.generate(provider, job_input["facts"]).model_dump()


def _apply_brief_summary(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    brief = db.scalar(select(Brief).where(Brief.project_id == job.project_id))
    if brief is None:
        return
    summary = brief_summary.BriefSummary.model_validate(result)
    brief.summary = brief_summary.envelope(summary, job.input["facts"], provider)
    # A new summary has new facts to check, so any earlier confirmation no longer applies.
    brief.summary_confirmed_at = None


HANDLERS: dict[str, JobHandler] = {
    JobKind.BRIEF_SUMMARY: JobHandler(_run_brief_summary, _apply_brief_summary, brief_summary.PROMPT_VERSION),
}


# --- Sessions -----------------------------------------------------------------------------


@contextmanager
def _new_session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


SessionFactory = Callable[[], Any]  # returns a context manager yielding a Session


def get_session_factory() -> SessionFactory:
    """FastAPI dependency: how a background job opens its own session. Tests override it."""
    return _new_session


# --- Reading jobs -------------------------------------------------------------------------


def _stale_after() -> timedelta:
    return timedelta(minutes=get_settings().ai_job_stale_minutes)


def expire_if_stale(db: Session, job: AiJob) -> bool:
    """Mark a job that has been active for too long as failed. Returns True if it changed."""
    if job.status not in ACTIVE:
        return False
    since = job.started_at or job.created_at
    if since is None or datetime.now(UTC) - since < _stale_after():
        return False
    job.status = JobStatus.FAILED
    job.error = STALE_MESSAGE
    job.finished_at = datetime.now(UTC)
    db.flush()
    return True


def latest_job(db: Session, project_id: uuid.UUID, kind: str) -> AiJob | None:
    job = db.scalar(
        select(AiJob)
        .where(AiJob.project_id == project_id, AiJob.kind == kind)
        .order_by(AiJob.created_at.desc(), AiJob.id.desc())
        .limit(1)
    )
    if job is not None:
        expire_if_stale(db, job)
    return job


def active_job(db: Session, project_id: uuid.UUID, kind: str) -> AiJob | None:
    job = latest_job(db, project_id, kind)
    return job if job is not None and job.status in ACTIVE else None


# --- Creating and running jobs ------------------------------------------------------------


def create_job(db: Session, project: Project, kind: str, job_input: dict[str, Any]) -> AiJob:
    job = AiJob(
        project_id=project.id,
        kind=kind,
        status=JobStatus.QUEUED,
        input=job_input,
        prompt_version=HANDLERS[kind].prompt_version,
        # The clock time, not the transaction's start: "latest job" must follow click order.
        created_at=datetime.now(UTC),
    )
    db.add(job)
    db.flush()
    return job


def run_job(job_id: uuid.UUID, session_factory: SessionFactory, provider: AiProvider) -> None:
    """Run one job to the end. Never raises: every outcome is written to the job row."""
    with session_factory() as db:
        job = db.get(AiJob, job_id)
        if job is None or job.status != JobStatus.QUEUED:
            return
        handler = HANDLERS[job.kind]
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        job.provider, job.model = provider.name, provider.model
        job_input = dict(job.input)
        db.commit()

        result: dict[str, Any] | None = None
        error = UNEXPECTED_MESSAGE
        attempts = 0
        while attempts < MAX_ATTEMPTS:
            attempts += 1
            try:
                result = handler.run(provider, job_input)
                break
            except AiError as e:
                error = e.message
                log.warning("AI job %s attempt %s failed: %s", job_id, attempts, e.message)
                if not e.retryable:
                    break
            except Exception:
                log.exception("AI job %s crashed", job_id)
                error = UNEXPECTED_MESSAGE
                break

        db.refresh(job)
        job.attempts = attempts
        job.finished_at = datetime.now(UTC)
        if job.status != JobStatus.RUNNING:
            # Marked stale while the model was still working; the user has moved on.
            db.commit()
            return
        project = db.get(Project, job.project_id)
        owner_id = project.owner_id if project else None
        if result is None:
            job.status = JobStatus.FAILED
            job.error = error
            # Counted so failures can be watched; only the kind is recorded, never the text.
            track(db, f"{job.kind}_failed", user_id=owner_id, project_id=job.project_id)
        else:
            try:
                handler.apply(db, job, result, provider)
            except Exception:
                log.exception("AI job %s could not save its result", job_id)
                db.rollback()
                job = db.get(AiJob, job_id)
                if job is None:
                    return
                job.status, job.error, job.finished_at = JobStatus.FAILED, UNEXPECTED_MESSAGE, datetime.now(UTC)
                db.commit()
                return
            job.status = JobStatus.SUCCEEDED
            job.result = result
            job.error = None
            track(db, f"{job.kind}_generated", user_id=owner_id, project_id=job.project_id)
        db.commit()
