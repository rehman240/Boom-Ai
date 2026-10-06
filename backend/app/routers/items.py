"""Shared routes for every campaign item: audience cards, directions and assets.

Each stage adds its own route to generate items; editing, versions, approval and
choosing work the same way for all of them, so they live here once.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import items, pipeline
from app.db import get_db
from app.deps import get_editable_project, get_owned_project
from app.events import track
from app.models import CampaignItem, ItemKind, Project
from app.schemas.item import ItemEdit, ItemOut, RevisionOut, SaveVersion

router = APIRouter(prefix="/projects/{project_id}/items", tags=["items"])

# Kinds where the user chooses one: the primary audience and the campaign direction.
SELECTABLE = {ItemKind.AUDIENCE, ItemKind.DIRECTION}


def item_out(db: Session, item: CampaignItem) -> ItemOut:
    return ItemOut(
        id=item.id,
        kind=item.kind,
        key=item.key,
        position=item.position,
        data=item.data,
        origin=item.origin,
        selected=item.selected,
        approved_at=item.approved_at,
        version=item.version,
        unsaved_changes=items.has_unsaved_changes(db, item),
        updated_at=item.updated_at,
    )


def _item(project: Project, item_id: uuid.UUID, db: Session, *, for_update: bool = True) -> CampaignItem:
    """A live item of this campaign, or 404. Items of other campaigns are 404 too.

    Changes lock the row until they commit, so two saves at once (two tabs, or an edit
    landing while a generation finishes) are applied one after the other, never mixed."""
    item = db.get(CampaignItem, item_id, with_for_update=for_update)
    if item is None or item.project_id != project.id or item.archived_at is not None:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


def _changed(db: Session, project: Project, item: CampaignItem) -> ItemOut:
    project.updated_at = func.now()  # shows on the dashboard as "last edited"
    db.commit()
    db.refresh(item)
    return item_out(db, item)


@router.get("", response_model=list[ItemOut])
def list_items(kind: ItemKind, project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return [item_out(db, item) for item in items.live_items(db, project.id, kind)]


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: uuid.UUID, project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return item_out(db, _item(project, item_id, db, for_update=False))


@router.patch("/{item_id}", response_model=ItemOut)
def edit_item(
    item_id: uuid.UUID,
    body: ItemEdit,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
):
    item = _item(project, item_id, db)
    unknown = sorted(set(body.data) - set(item.data))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown field: {unknown[0]}")
    try:
        merged = pipeline.validate_data(item, {**item.data, **body.data})
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from None
    items.edit(db, item, {k: merged[k] for k in body.data})
    return _changed(db, project, item)


@router.get("/{item_id}/versions", response_model=list[RevisionOut])
def list_versions(item_id: uuid.UUID, project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return items.history(db, _item(project, item_id, db, for_update=False))


@router.post("/{item_id}/versions", response_model=RevisionOut, status_code=201)
def save_version(
    item_id: uuid.UUID,
    body: SaveVersion,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
):
    item = _item(project, item_id, db)
    revision = items.save_version(db, item, body.label)
    project.updated_at = func.now()
    db.commit()
    db.refresh(revision)
    return revision


@router.post("/{item_id}/versions/{number}/restore", response_model=ItemOut)
def restore_version(
    item_id: uuid.UUID,
    number: int,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
):
    item = _item(project, item_id, db)
    try:
        items.restore(db, item, number)
    except LookupError:
        raise HTTPException(status_code=404, detail="Version not found.") from None
    track(db, "version_restored", user_id=project.owner_id, project_id=project.id)
    return _changed(db, project, item)


@router.post("/{item_id}/approve", response_model=ItemOut)
def approve_item(item_id: uuid.UUID, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    item = _item(project, item_id, db)
    items.approve(db, item)
    return _changed(db, project, item)


@router.delete("/{item_id}/approve", response_model=ItemOut)
def unapprove_item(item_id: uuid.UUID, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    item = _item(project, item_id, db)
    items.unapprove(db, item)
    return _changed(db, project, item)


@router.post("/{item_id}/select", response_model=ItemOut)
def select_item(item_id: uuid.UUID, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    item = _item(project, item_id, db)
    if item.kind not in SELECTABLE:
        raise HTTPException(status_code=422, detail="Only an audience or a direction can be chosen.")
    items.select_item(db, item)
    if item.kind in pipeline.NEXT_STAGE_ON_SELECT:
        pipeline.advance(project, pipeline.NEXT_STAGE_ON_SELECT[item.kind])
    track(db, f"{item.kind}_selected", user_id=project.owner_id, project_id=project.id)
    return _changed(db, project, item)
