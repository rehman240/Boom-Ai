from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TimestampMixin


class User(IdMixin, TimestampMixin, Base):
    """Account owner. One owner per workspace, so the workspace name lives on the user."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    workspace_name: Mapped[str] = mapped_column(String(120), default="My workspace")
