"""add study_instance_uid to worklist

Revision ID: 006
Revises: 005
Create Date: 2026-03-19 02:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add study_instance_uid column to worklist table
    op.add_column('worklist', sa.Column('study_instance_uid', sa.String(length=128), nullable=True))
    op.create_index(op.f('ix_worklist_study_instance_uid'), 'worklist', ['study_instance_uid'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_worklist_study_instance_uid'), table_name='worklist')
    op.drop_column('worklist', 'study_instance_uid')
