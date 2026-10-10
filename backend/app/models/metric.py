import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


class MetricEntry(IdMixin, TimestampMixin, Base):
    """Results the user typed in for one period of a running campaign (Manage Conversions).

    Kept apart from the measurement plan item: recording results later must not count as
    changing the approved plan. Any figure may be missing; the calculations say so.
    """

    __tablename__ = "metric_entries"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(60))  # the user's own label, e.g. "Week 1"
    spend_cents: Mapped[int | None] = mapped_column(BigInteger)
    leads: Mapped[int | None] = mapped_column(Integer)
    sales: Mapped[int | None] = mapped_column(Integer)
    revenue_cents: Mapped[int | None] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(300))
