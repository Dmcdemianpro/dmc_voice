"""add findings_json and finding_category to rad_report_history, make template_id nullable

Revision ID: 008
Revises: 007
Create Date: 2026-03-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('rad_report_history', sa.Column('findings_json', JSONB, nullable=True))
    op.add_column('rad_report_history', sa.Column('finding_category', sa.String(length=30), nullable=True))
    op.alter_column('rad_report_history', 'template_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column('rad_report_history', 'template_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('rad_report_history', 'finding_category')
    op.drop_column('rad_report_history', 'findings_json')
