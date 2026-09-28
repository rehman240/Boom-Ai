import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


class JobKind(enum.StrEnum):
    BRIEF_SUMMARY = "brief_summary"
    AUDIENCE = "audience"
    DIRECTIONS = "directions"
    ASSETS = "assets"
    FIELD = "field"  # regenerate a single field


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AiJob(IdMixin, TimestampMixin, Base):
    """One background AI generation. Kept in Postgres so it survives a page refresh."""

    __tablename__ = "ai_jobs"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default=JobStatus.QUEUED, index=True)
    input: Mapped[dict] = mapped_column(JSONB, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB)  # validated structured output
    error: Mapped[str | None] = mapped_column(Text)  # user-safe message, never prompts or keys
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    # Provenance of every generation, as the client brief asks.
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(32))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
