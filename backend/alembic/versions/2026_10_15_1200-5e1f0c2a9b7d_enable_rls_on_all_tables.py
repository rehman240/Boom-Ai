"""enable row level security on all tables

Supabase exposes the public schema through its Data API. The app never uses that API (the
backend talks to Postgres directly), so RLS with no policies blocks it completely. The
backend's role owns the tables, and owners are not bound by RLS, so the app is unaffected.
Plain Postgres, so it works the same on any host. New tables need the same line.

Revision ID: 5e1f0c2a9b7d
Revises: cc4a568f3e38
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '5e1f0c2a9b7d'
down_revision: Union[str, Sequence[str], None] = 'cc4a568f3e38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "alembic_version",
    "users",
    "projects",
    "briefs",
    "uploads",
    "ai_jobs",
    "campaign_items",
    "revisions",
    "events",
    "metric_entries",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
