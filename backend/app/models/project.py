import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
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
    # Goes up by one with every saved revision of any item, so each version of the
    # campaign has a number that generations and exports can be labelled with.
    version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Who the campaign must not target, written at Identify Target. Every later stage gets it.
    audience_exclusions: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
