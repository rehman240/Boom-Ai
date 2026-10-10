"""Manage Conversions: the measurement plan and the results the user enters (client brief 4.8).

Editing the plan's goal, landing page, checklist steps and cadence, its versions and its
approval use the shared item routes in app/routers/items.py. This router creates the plan,
ticks checklist steps, and keeps the result entries.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import items, measurement
from app.db import get_db
from app.deps import get_editable_project, get_owned_project
from app.events import track
from app.models import CampaignItem, MetricEntry, Project
from app.routers.items import item_out
from app.schemas.measurement import ConversionStage, EntryIn, EntryOut, MeasurementPlanOut, StepDone, Totals

router = APIRouter(prefix="/projects/{project_id}/conversions", tags=["conversions"])

MAX_ENTRIES = 200


def _plan_out(db: Session, project: Project, item: CampaignItem) -> MeasurementPlanOut:
    start, end = measurement.brief_dates(db, project)
    return MeasurementPlanOut(
        **item_out(db, item).model_dump(),
        review_dates=measurement.review_dates(item.data.get("review_cadence", "weekly"), start, end),
    )


def _stage(db: Session, project: Project) -> ConversionStage:
    item = measurement.plan_item(db, project.id)
    rows = measurement.entries(db, project.id)
    budget = measurement.media_budget(db, project)
    start, end = measurement.brief_dates(db, project)
    return ConversionStage(
        plan=_plan_out(db, project, item) if item else None,
        entries=[EntryOut.model_validate(r) for r in rows],
        totals=Totals(**measurement.totals(rows)),
        results=measurement.results(rows, budget),
        blocked_reason=measurement.missing_prerequisite(db, project),
        media_budget_cents=budget,
        start_date=start,
        end_date=end,
    )


def _touched(db: Session, project: Project) -> ConversionStage:
    project.updated_at = func.now()  # shows on the dashboard as "last edited"
    db.commit()
    return _stage(db, project)


def _require_ready(db: Session, project: Project) -> None:
    reason = measurement.missing_prerequisite(db, project)
    if reason is not None:
        raise HTTPException(status_code=409, detail=reason)


def _entry(db: Session, project: Project, entry_id: uuid.UUID) -> MetricEntry:
    entry = db.get(MetricEntry, entry_id)
    if entry is None or entry.project_id != project.id:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


@router.get("", response_model=ConversionStage)
def get_conversions(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return _stage(db, project)


@router.post("/plan", response_model=ConversionStage, status_code=201)
def create_plan(project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    """Start the measurement plan from the template. A second call changes nothing."""
    _require_ready(db, project)
    if measurement.plan_item(db, project.id) is None:
        measurement.create_plan(db, project)
        track(db, "measurement_plan_created", user_id=project.owner_id, project_id=project.id)
    return _touched(db, project)


@router.put("/plan/checklist/{step_id}", response_model=ConversionStage)
def tick_step(step_id: str, body: StepDone, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    item = measurement.plan_item(db, project.id)
    if item is None:
        raise HTTPException(status_code=404, detail="There is no measurement plan yet.")
    try:
        measurement.set_step_done(db, items.lock(db, item.id), step_id, body.done)
    except LookupError:
        raise HTTPException(status_code=404, detail="Checklist step not found.") from None
    return _touched(db, project)


@router.post("/entries", response_model=ConversionStage, status_code=201)
def add_entry(body: EntryIn, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    _require_ready(db, project)
    if len(measurement.entries(db, project.id)) >= MAX_ENTRIES:
        raise HTTPException(status_code=422, detail=f"A campaign can have at most {MAX_ENTRIES} entries.")
    db.add(MetricEntry(project_id=project.id, **body.model_dump()))
    db.flush()
    # Only that results were entered is counted, never the figures.
    track(db, "results_entered", user_id=project.owner_id, project_id=project.id)
    return _touched(db, project)


@router.put("/entries/{entry_id}", response_model=ConversionStage)
def change_entry(
    entry_id: uuid.UUID, body: EntryIn, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)
):
    """The whole entry is replaced, so a figure cleared in the form is cleared here too."""
    entry = _entry(db, project, entry_id)
    for field, value in body.model_dump().items():
        setattr(entry, field, value)
    db.flush()
    return _touched(db, project)


@router.delete("/entries/{entry_id}", response_model=ConversionStage)
def delete_entry(entry_id: uuid.UUID, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    db.delete(_entry(db, project, entry_id))
    db.flush()
    return _touched(db, project)
