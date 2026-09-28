"""Basic event counts. Only pass an event name and ids, never campaign text."""

import uuid

from sqlalchemy.orm import Session

from app.models import Event


def track(db: Session, name: str, user_id: uuid.UUID | None = None, project_id: uuid.UUID | None = None) -> None:
    db.add(Event(name=name, user_id=user_id, project_id=project_id))
