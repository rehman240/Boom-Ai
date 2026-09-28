import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin


class Event(IdMixin, Base):
    """Basic product analytics: event name only. Never store campaign text here."""

    __tablename__ = "events"

    name: Mapped[str] = mapped_column(String(64), index=True)  # e.g. "brief_completed"
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
