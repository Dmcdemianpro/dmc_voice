"""add pipeline_metadata to rad_report_history

Revision ID: 007
Revises: 006
Create Date: 2026-03-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('rad_report_history', sa.Column('pipeline_metadata', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('rad_report_history', 'pipeline_metadata')
