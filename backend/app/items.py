"""Campaign items and their versions: the rules every AI stage after the brief follows.

An item (audience card, direction or asset) has a working copy in `data`, which the user
edits freely, and a list of revisions, which are never changed or deleted. The rules from
the client brief live here, in one place, so no stage can forget them:

- Nothing the user made is lost. Before the AI replaces an item, or an old version is
  restored, unsaved edits are kept as their own revision first.
- The AI never changes approved work. A person's own change does, and asks for approval again.
- Regenerating one field changes that field and nothing else.
- Every revision records its campaign version, model, prompt version and time.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import CampaignItem, ItemOrigin, Project, Revision, RevisionSource

HISTORY_LIMIT = 20  # how many revisions the history panel shows


class ItemLocked(Exception):
    """The AI was asked to change approved work. `message` is safe to show the user."""

    def __init__(self, message: str = "This is approved, so it was left unchanged. Unapprove it to change it."):
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class Provenance:
    """Where an AI change came from."""

    provider: str
    model: str
    prompt_version: str
    job_id: uuid.UUID | None = None


# --- Reading ------------------------------------------------------------------------------


def live_items(db: Session, project_id: uuid.UUID, kind: str) -> list[CampaignItem]:
    return list(
        db.scalars(
            select(CampaignItem)
            .where(CampaignItem.project_id == project_id, CampaignItem.kind == kind, CampaignItem.archived_at.is_(None))
            .order_by(CampaignItem.position, CampaignItem.created_at, CampaignItem.id)
        )
    )


def selected_item(db: Session, project_id: uuid.UUID, kind: str) -> CampaignItem | None:
    return db.scalar(
        select(CampaignItem).where(
            CampaignItem.project_id == project_id,
            CampaignItem.kind == kind,
            CampaignItem.selected.is_(True),
            CampaignItem.archived_at.is_(None),
        )
    )


def latest_revision(db: Session, item: CampaignItem) -> Revision | None:
    return db.scalar(select(Revision).where(Revision.item_id == item.id, Revision.number == item.version))


def get_revision(db: Session, item: CampaignItem, number: int) -> Revision | None:
    return db.scalar(select(Revision).where(Revision.item_id == item.id, Revision.number == number))


def history(db: Session, item: CampaignItem, limit: int = HISTORY_LIMIT) -> list[Revision]:
    return list(
        db.scalars(
            select(Revision).where(Revision.item_id == item.id).order_by(Revision.number.desc()).limit(limit)
        )
    )


# Revisions that the AI or a copy wrote, as opposed to the user's own saves and restores.
_MACHINE_SOURCES = {RevisionSource.GENERATED, RevisionSource.FIELD_REGENERATED, RevisionSource.COPIED}


def user_touched(db: Session, item: CampaignItem) -> bool:
    """The user has put something of their own into this item: chosen, approved, written,
    edited, saved or restored it. A regeneration of a whole step must leave such items alone."""
    if item.selected or item.approved_at is not None or item.origin == ItemOrigin.USER:
        return True
    latest = latest_revision(db, item)
    return latest is None or latest.source not in _MACHINE_SOURCES or latest.data != item.data


def has_unsaved_changes(db: Session, item: CampaignItem) -> bool:
    """True when the working copy differs from the latest revision."""
    latest = latest_revision(db, item)
    return latest is None or latest.data != item.data


# --- Writing ------------------------------------------------------------------------------


def _next_project_version(db: Session, project_id: uuid.UUID) -> int:
    # One UPDATE ... RETURNING, so two saves at the same moment can't get the same number.
    return db.execute(
        update(Project).where(Project.id == project_id).values(version=Project.version + 1).returning(Project.version)
    ).scalar_one()


def _add_revision(
    db: Session,
    item: CampaignItem,
    source: str,
    *,
    provenance: Provenance | None = None,
    label: str | None = None,
    field: str | None = None,
    restored_from: int | None = None,
) -> Revision:
    item.version += 1
    revision = Revision(
        item_id=item.id,
        project_id=item.project_id,
        number=item.version,
        data=dict(item.data),
        source=source,
        label=label,
        field=field,
        restored_from=restored_from,
        project_version=_next_project_version(db, item.project_id),
        job_id=provenance.job_id if provenance else None,
        provider=provenance.provider if provenance else None,
        model=provenance.model if provenance else None,
        prompt_version=provenance.prompt_version if provenance else None,
        created_at=datetime.now(UTC),
    )
    db.add(revision)
    item.updated_at = func.now()
    db.flush()
    return revision


def _keep_unsaved_edits(db: Session, item: CampaignItem) -> None:
    """Store the user's unsaved edits as a revision before something replaces them."""
    if item.version > 0 and has_unsaved_changes(db, item):
        _add_revision(db, item, RevisionSource.KEPT_EDITS)


def add_item(
    db: Session,
    project_id: uuid.UUID,
    kind: str,
    key: str,
    data: dict[str, Any],
    *,
    position: int = 0,
    origin: str = ItemOrigin.AI,
    provenance: Provenance | None = None,
) -> CampaignItem:
    """A new item with its first revision."""
    item = CampaignItem(
        project_id=project_id, kind=kind, key=key, position=position, data=dict(data), origin=origin, version=0,
        # The clock time, not the transaction's start, so items added together keep their order.
        created_at=datetime.now(UTC),
    )
    db.add(item)
    db.flush()
    source = RevisionSource.GENERATED if origin == ItemOrigin.AI else RevisionSource.CREATED
    _add_revision(db, item, source, provenance=provenance)
    return item


def edit(db: Session, item: CampaignItem, changes: dict[str, Any]) -> CampaignItem:
    """Autosave of the user's edits: only the fields sent change. No revision is made;
    the user saves a version when they want one, and edits are kept before any AI change."""
    item.data = {**item.data, **changes}
    if item.approved_at is not None:
        item.approved_at = None  # the approved text is no longer what is shown, so ask again
    item.updated_at = func.now()
    db.flush()
    return item


def save_version(db: Session, item: CampaignItem, label: str | None = None) -> Revision:
    """The user's "Save version". If nothing changed, the latest revision is named instead."""
    latest = latest_revision(db, item)
    if latest is not None and latest.data == item.data:
        if label:
            latest.label = label
            db.flush()
        return latest
    return _add_revision(db, item, RevisionSource.SAVED, label=label)


def lock(db: Session, item_id: uuid.UUID) -> CampaignItem | None:
    """Load an item for a change, holding its row until the change commits.
    Jobs use this when they save, so a user's edit and an AI answer never interleave."""
    return db.get(CampaignItem, item_id, with_for_update=True, populate_existing=True)


def replace_by_ai(db: Session, item: CampaignItem, data: dict[str, Any], provenance: Provenance) -> Revision:
    """The AI rewrote the whole item. Approved work is refused; unsaved edits are kept first."""
    if item.approved_at is not None:
        raise ItemLocked()
    _keep_unsaved_edits(db, item)
    item.data = dict(data)
    return _add_revision(db, item, RevisionSource.GENERATED, provenance=provenance)


def replace_field_by_ai(
    db: Session, item: CampaignItem, field: str, value: Any, provenance: Provenance
) -> Revision:
    """The AI rewrote one field. Every other field stays exactly as it was."""
    if item.approved_at is not None:
        raise ItemLocked()
    if field not in item.data:
        raise KeyError(field)
    _keep_unsaved_edits(db, item)
    item.data = {**item.data, field: value}
    return _add_revision(db, item, RevisionSource.FIELD_REGENERATED, provenance=provenance, field=field)


def restore(db: Session, item: CampaignItem, number: int) -> Revision:
    """Bring an earlier revision back as a new one, so the history only ever grows."""
    old = get_revision(db, item, number)
    if old is None:
        raise LookupError(number)
    _keep_unsaved_edits(db, item)
    item.data = dict(old.data)
    item.approved_at = None
    return _add_revision(db, item, RevisionSource.RESTORED, restored_from=number)


def approve(db: Session, item: CampaignItem) -> CampaignItem:
    if item.approved_at is None:
        item.approved_at = datetime.now(UTC)
        db.flush()
    return item


def unapprove(db: Session, item: CampaignItem) -> CampaignItem:
    item.approved_at = None
    db.flush()
    return item


def select_item(db: Session, item: CampaignItem) -> CampaignItem:
    """Make this the one chosen item of its kind (primary audience, chosen direction)."""
    db.execute(
        update(CampaignItem)
        .where(
            CampaignItem.project_id == item.project_id,
            CampaignItem.kind == item.kind,
            CampaignItem.id != item.id,
        )
        .values(selected=False)
    )
    item.selected = True
    db.flush()
    return item


def archive(db: Session, item: CampaignItem) -> None:
    """Take an item out of the live set without deleting it or its history."""
    item.archived_at = datetime.now(UTC)
    item.selected = False
    db.flush()


def copy_items(db: Session, source_project_id: uuid.UUID, target_project_id: uuid.UUID) -> None:
    """Duplicate a campaign's live items. Choices come along; approvals don't, because
    the copy is a new campaign that the user reviews again."""
    rows = db.scalars(
        select(CampaignItem).where(CampaignItem.project_id == source_project_id, CampaignItem.archived_at.is_(None))
    ).all()
    for src in rows:
        item = CampaignItem(
            project_id=target_project_id,
            kind=src.kind,
            key=src.key,
            position=src.position,
            data=dict(src.data),
            origin=src.origin,
            selected=src.selected,
            version=0,
        )
        db.add(item)
        db.flush()
        _add_revision(db, item, RevisionSource.COPIED)
