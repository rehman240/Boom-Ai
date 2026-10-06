import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import jobs
from app.ai import brief_summary
from app.ai.provider import AiProvider, get_ai_provider
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.events import track
from app.models import Brief, JobKind, Project, ProjectStage, ProjectStatus, User
from app.schemas.brief import REQUIRED_FIELDS, BriefOut, BriefState, BriefUpdate, SummaryOut
from app.schemas.job import JobOut

log = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/brief", tags=["brief"])


def _brief_for(project: Project, db: Session) -> Brief:
    """Campaigns get their brief at creation; older rows are healed rather than 404'd."""
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    if brief is None:
        brief = Brief(project_id=project.id)
        db.add(brief)
        db.flush()
    return brief


def _missing_required(brief: Brief) -> list[str]:
    return [f for f in REQUIRED_FIELDS if getattr(brief, f) in (None, "", [])]


def _summary(brief: Brief) -> SummaryOut | None:
    """The stored summary with its status, or None if there isn't a readable one."""
    stored = brief.summary
    if not isinstance(stored, dict) or "data" not in stored:
        return None
    current = brief_summary.facts_hash(brief_summary.brief_facts(brief))
    if stored.get("input_hash") != current:
        status = "outdated"
    elif brief.summary_confirmed_at is not None:
        status = "confirmed"
    else:
        status = "ready"
    try:
        return SummaryOut(
            data=stored["data"],
            status=status,
            generated_at=stored["generated_at"],
            provider=stored.get("provider", ""),
            model=stored.get("model", ""),
            prompt_version=stored.get("prompt_version", ""),
        )
    except (KeyError, ValidationError):
        log.warning("Brief %s has a summary in an old shape; ignoring it", brief.id)
        return None


def _state(brief: Brief, db: Session) -> BriefState:
    job = jobs.latest_job(db, brief.project_id, JobKind.BRIEF_SUMMARY)
    return BriefState(
        brief=BriefOut.model_validate(brief),
        missing_required=_missing_required(brief),
        summary=_summary(brief),
        summary_job=JobOut.model_validate(job) if job else None,
    )


@router.get("", response_model=BriefState)
def get_brief(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> BriefState:
    brief = _brief_for(project, db)
    state = _state(brief, db)
    db.commit()  # also saves a stale job being marked failed
    return state


@router.patch("", response_model=BriefState)
def update_brief(
    body: BriefUpdate,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
) -> BriefState:
    """Autosave. Only the fields actually sent are touched, so nothing else is overwritten."""
    changes = body.model_dump(exclude_unset=True)
    # A campaign always has an engine; sending none leaves the current one.
    if "ai_engine" in changes and changes["ai_engine"] is None:
        del changes["ai_engine"]
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to save.")

    brief = _brief_for(project, db)
    for field, value in changes.items():
        setattr(brief, field, value)

    if project.status == ProjectStatus.DRAFT:
        project.status = ProjectStatus.IN_PROGRESS
        track(db, "brief_started", user_id=project.owner_id, project_id=project.id)
    # The brief is part of the campaign, so editing it counts as editing the campaign.
    # Without this the dashboard would keep showing the moment the campaign was created.
    project.updated_at = func.now()

    db.commit()
    db.refresh(brief)
    return _state(brief, db)


@router.post("/summary", response_model=JobOut, status_code=202)
def start_summary(
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Start (or rejoin) the summary job. The page polls GET /projects/{id}/jobs/{job_id}."""
    brief = _brief_for(project, db)
    if _missing_required(brief):
        raise HTTPException(status_code=409, detail="Fill in the required fields before reviewing the brief.")
    return jobs.start_job(
        db,
        background,
        project,
        user,
        JobKind.BRIEF_SUMMARY,
        {"facts": brief_summary.brief_facts(brief)},
        provider=provider,
        session_factory=session_factory,
    )


@router.post("/summary/confirm", response_model=BriefState)
def confirm_summary(project: Project = Depends(get_editable_project), db: Session = Depends(get_db)) -> BriefState:
    """The user checked the extracted facts. Only a summary of the current brief can be confirmed."""
    brief = _brief_for(project, db)
    summary = _summary(brief)
    if summary is None:
        raise HTTPException(status_code=409, detail="There is no summary to confirm yet.")
    if summary.status == "outdated":
        raise HTTPException(status_code=409, detail="The brief changed after this summary. Regenerate it first.")

    if brief.summary_confirmed_at is None:
        brief.summary_confirmed_at = datetime.now(UTC)
        track(db, "brief_summary_confirmed", user_id=project.owner_id, project_id=project.id)
    # The brief is done, so the campaign now continues at Identify Target.
    if project.stage == ProjectStage.BRIEF:
        project.stage = ProjectStage.TARGET
    project.updated_at = func.now()
    db.commit()
    db.refresh(brief)
    return _state(brief, db)
