"""add study_instance_uid to worklist

Revision ID: 007
Revises: 006
Create Date: 2026-03-19

"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add study_instance_uid column to worklist table
    op.add_column('worklist', sa.Column('study_instance_uid', sa.String(length=128), nullable=True))
    op.create_index(op.f('ix_worklist_study_instance_uid'), 'worklist', ['study_instance_uid'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_worklist_study_instance_uid'), table_name='worklist')
    op.drop_column('worklist', 'study_instance_uid')
