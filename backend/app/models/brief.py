import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


# Who is making the campaign. The client wants to know this early, for every campaign.
USER_ROLES = {
    "business_owner": "Entrepreneur with an existing business",
    "agency": "Marketing or advertising agency",
    "research": "General research and development",
}


class Brief(IdMixin, TimestampMixin, Base):
    """Campaign brief, one per project.

    Fields are nullable so autosave can store partial input. Required fields are
    checked before the AI summary runs.
    """

    __tablename__ = "briefs"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)

    # Who is making this campaign (see USER_ROLES) and which AI engine the user chose for it.
    # Both are asked per campaign, so one account can work as an agency and a business.
    user_role: Mapped[str | None] = mapped_column(String(32))
    ai_engine: Mapped[str] = mapped_column(String(32), default="claude", server_default="claude")

    business_name: Mapped[str | None] = mapped_column(String(200))
    product_or_service: Mapped[str | None] = mapped_column(String(300))
    product_url: Mapped[str | None] = mapped_column(String(500))  # stored only, never scraped
    description: Mapped[str | None] = mapped_column(Text)  # one sentence description
    differentiators: Mapped[str | None] = mapped_column(Text)  # what makes it different
    goal: Mapped[str | None] = mapped_column(String(100))  # desired action, e.g. preorders
    offer_terms: Mapped[str | None] = mapped_column(Text)  # price or offer terms, only from the user
    target_location: Mapped[str | None] = mapped_column(String(200))
    # Interface language, fixed for this release. The AI writes in whatever language the brief is in.
    language: Mapped[str] = mapped_column(String(20), default="English")
    brand_voice: Mapped[list[str]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[str | None] = mapped_column(Text)
    channels: Mapped[list[str]] = mapped_column(JSONB, default=list)  # channels of interest
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    budget_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # AI normalized summary (validated JSON) and when the user confirmed it.
    summary: Mapped[dict | None] = mapped_column(JSONB)
    summary_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
