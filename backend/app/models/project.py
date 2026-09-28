import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


class ProjectStage(enum.StrEnum):
    """Where the user is in the flow. Drives the 6-segment progress bar."""

    BRIEF = "brief"
    TARGET = "target"
    CAMPAIGN = "campaign"
    CREATIVE = "creative"
    BUDGET = "budget"
    CONVERSIONS = "conversions"
    REVIEW = "review"


class ProjectStatus(enum.StrEnum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    READY = "ready"  # all components approved, ready to export


class Project(IdMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default=ProjectStatus.DRAFT)
    stage: Mapped[str] = mapped_column(String(32), default=ProjectStage.BRIEF)
    # Read-only sample campaign opened from the landing page.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
