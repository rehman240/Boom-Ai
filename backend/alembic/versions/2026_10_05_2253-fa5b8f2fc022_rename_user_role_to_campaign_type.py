"""rename user role to campaign type

Revision ID: fa5b8f2fc022
Revises: a65e19b29ef8
Create Date: 2026-10-05 22:53:41.122311

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa5b8f2fc022'
down_revision: Union[str, Sequence[str], None] = 'a65e19b29ef8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """The question is now "Is this campaign..." rather than "Who are you?"."""
    op.alter_column("briefs", "user_role", new_column_name="campaign_type")
    op.execute("UPDATE briefs SET campaign_type = 'own_business' WHERE campaign_type = 'business_owner'")
    op.execute("UPDATE briefs SET campaign_type = 'client' WHERE campaign_type = 'agency'")


def downgrade() -> None:
    op.execute("UPDATE briefs SET campaign_type = 'agency' WHERE campaign_type = 'client'")
    op.execute("UPDATE briefs SET campaign_type = 'business_owner' WHERE campaign_type = 'own_business'")
    op.alter_column("briefs", "campaign_type", new_column_name="user_role")
