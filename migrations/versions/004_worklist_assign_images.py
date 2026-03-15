"""Worklist: assigned_to + has_images

Revision ID: 004
Revises: 003
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("worklist", sa.Column(
        "assigned_to_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.add_column("worklist", sa.Column("assigned_to_name", sa.String(200), nullable=True))
    op.add_column("worklist", sa.Column("has_images", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("worklist", "assigned_to_id")
    op.drop_column("worklist", "assigned_to_name")
    op.drop_column("worklist", "has_images")
