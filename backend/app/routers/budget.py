"""Allocate Budget: the recommended channel split (client brief 4.7).

Saving a version, restoring one ("Reset suggestion"), approving and editing the reasoning,
assumptions or production costs use the shared item routes in app/routers/items.py. This
router adds generating and the line changes that keep the total exact.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import budget as stage
from app import budget_math, items, jobs, pipeline
from app.ai import brief_summary, budget, safety
from app.ai.audience import Channel
from app.ai.provider import AiProvider, get_ai_provider
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.models import Brief, CampaignItem, ItemOrigin, JobKind, Project, User
from app.routers.items import item_out
from app.schemas.budget import BudgetPlanOut, BudgetStage, LineAdd, LineChange
from app.schemas.job import JobOut

router = APIRouter(prefix="/projects/{project_id}/budget", tags=["budget"])

APPROVED = "The budget is approved. Unapprove it to get a new suggestion."
NO_PLAN = "There is no budget plan yet."


def _user_text(db: Session, project: Project) -> str:
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    facts = brief_summary.brief_facts(brief) if brief else {}
    return safety.user_words(facts, list(project.audience_exclusions or []))


def _plan_out(db: Session, project: Project, item: CampaignItem) -> BudgetPlanOut:
    data = item.data
    return BudgetPlanOut(
        **item_out(db, item).model_dump(),
        percents=budget_math.percents(data["lines"], data["total_cents"]),
        review_flags=budget.review_flags(data, by_ai=item.origin == ItemOrigin.AI, user_text=_user_text(db, project)),
        outdated=pipeline.is_outdated(db, item, stage.current_hash(db, project)),
        total_changed=data["total_cents"] != stage.brief_total(db, project),
    )


def _stage(db: Session, project: Project) -> BudgetStage:
    item = stage.plan_item(db, project.id)
    job = jobs.latest_job(db, project.id, JobKind.BUDGET)
    start, end = stage.brief_dates(db, project)
    return BudgetStage(
        plan=_plan_out(db, project, item) if item else None,
        job=JobOut.model_validate(job) if job else None,
        blocked_reason=stage.missing_prerequisite(db, project),
        total_cents=stage.brief_total(db, project),
        start_date=start,
        end_date=end,
        channels=list(Channel.__args__),
    )


def _plan(db: Session, project: Project) -> CampaignItem:
    """The plan, locked until the change commits, so two quick changes apply one after the other."""
    item = stage.plan_item(db, project.id)
    if item is None:
        raise HTTPException(status_code=404, detail=NO_PLAN)
    return items.lock(db, item.id)


def _changed(db: Session, project: Project, item: CampaignItem) -> BudgetPlanOut:
    project.updated_at = func.now()  # shows on the dashboard as "last edited"
    db.commit()
    db.refresh(item)
    return _plan_out(db, project, item)


def _apply(db: Session, project: Project, change) -> BudgetPlanOut:
    item = _plan(db, project)
    try:
        change(item)
    except LookupError:
        raise HTTPException(status_code=404, detail="Channel not found.") from None
    except budget_math.BudgetError as e:
        raise HTTPException(status_code=422, detail=str(e)) from None
    return _changed(db, project, item)


@router.get("", response_model=BudgetStage)
def get_budget(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> BudgetStage:
    out = _stage(db, project)
    db.commit()  # also saves a stale job being marked failed
    return out


@router.post("/generate", response_model=JobOut, status_code=202)
def generate_budget(
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Suggest a mix. Replaces the current plan, whose edits stay in its history; never an approved one."""
    reason = stage.missing_prerequisite(db, project)
    if reason is not None:
        raise HTTPException(status_code=409, detail=reason)
    current = stage.plan_item(db, project.id)
    if current is not None and current.approved_at is not None:
        raise HTTPException(status_code=409, detail=APPROVED)
    return jobs.start_job(
        db, background, project, user, JobKind.BUDGET, stage.job_input(db, project),
        provider=provider, session_factory=session_factory,
    )


@router.patch("/lines/{line_id}", response_model=BudgetPlanOut)
def change_line(
    line_id: str, body: LineChange, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)
):
    return _apply(db, project, lambda item: stage.change_line(db, item, line_id, **body.model_dump(exclude_none=True)))


@router.post("/lines", response_model=BudgetPlanOut, status_code=201)
def add_line(body: LineAdd, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    return _apply(db, project, lambda item: stage.add_line(db, item, body.channel, body.role))


@router.delete("/lines/{line_id}", response_model=BudgetPlanOut)
def remove_line(line_id: str, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    return _apply(db, project, lambda item: stage.remove_line(db, item, line_id))


@router.post("/fit", response_model=BudgetPlanOut)
def fit_to_brief(project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    """Spread the brief's current budget over the plan, keeping locked channels."""
    return _apply(db, project, lambda item: stage.fit_to_total(db, item, stage.brief_total(db, project)))
