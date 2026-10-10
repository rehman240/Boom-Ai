import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


class ItemKind(enum.StrEnum):
    """The pieces of work the AI stages produce after the brief."""

    AUDIENCE = "audience"  # one audience hypothesis card
    DIRECTION = "direction"  # one of the three campaign directions
    ASSET = "asset"  # one creative asset, e.g. the short ad copy
    BUDGET = "budget"  # the budget plan: channel split and production costs


class ItemOrigin(enum.StrEnum):
    AI = "ai"
    USER = "user"  # written by the user, e.g. their own audience


class RevisionSource(enum.StrEnum):
    """Why a revision was saved."""

    GENERATED = "generated"  # the AI wrote the whole item
    FIELD_REGENERATED = "field_regenerated"  # the AI rewrote one field only
    SAVED = "saved"  # the user pressed "Save version"
    KEPT_EDITS = "kept_edits"  # the user's unsaved edits, kept before something replaced them
    RESTORED = "restored"  # an earlier revision was brought back
    CREATED = "created"  # written by the user from scratch
    COPIED = "copied"  # came along when the campaign was duplicated


class CampaignItem(IdMixin, TimestampMixin, Base):
    """One audience card, campaign direction or asset: the current working copy.

    `data` is what the user sees and edits (autosaved). Every change worth keeping is
    also stored as an immutable `Revision`, so any earlier version can be restored.
    """

    __tablename__ = "campaign_items"
    __table_args__ = (
        # One live item per slot. Archived items keep their key, so they are left out.
        Index(
            "uq_campaign_items_live_key",
            "project_id",
            "kind",
            "key",
            unique=True,
            postgresql_where=text("archived_at IS NULL"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(64))  # slot within the kind, e.g. "short_ad_copy" or "2"
    position: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    origin: Mapped[str] = mapped_column(String(16), default=ItemOrigin.AI)
    # The primary audience or the chosen direction. At most one per kind.
    selected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Replaced by a newer set but kept, so nothing the user made is ever erased.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=0)  # number of the latest revision


class Revision(IdMixin, Base):
    """A saved, never-changed copy of an item, with where it came from."""

    __tablename__ = "revisions"
    __table_args__ = (UniqueConstraint("item_id", "number"),)

    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_items.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 ... per item
    data: Mapped[dict] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String(32))
    label: Mapped[str | None] = mapped_column(String(120))  # the user's name for a saved version
    field: Mapped[str | None] = mapped_column(String(64))  # the one field a field regeneration changed
    restored_from: Mapped[int | None] = mapped_column(Integer)
    # Provenance, as the client brief asks: campaign version, prompt version, model and time.
    project_version: Mapped[int] = mapped_column(Integer)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ai_jobs.id", ondelete="SET NULL"))
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
