"""reports: signed_by y assigned_to

Revision ID: 002
Revises: 001
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("signed_by_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reports", sa.Column("signed_by_name", sa.String(200), nullable=True))
    op.add_column("reports", sa.Column("assigned_to_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reports", sa.Column("assigned_to_name", sa.String(200), nullable=True))
    op.create_foreign_key("fk_reports_signed_by", "reports", "users", ["signed_by_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_reports_assigned_to", "reports", "users", ["assigned_to_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_reports_signed_by", "reports", type_="foreignkey")
    op.drop_constraint("fk_reports_assigned_to", "reports", type_="foreignkey")
    op.drop_column("reports", "signed_by_id")
    op.drop_column("reports", "signed_by_name")
    op.drop_column("reports", "assigned_to_id")
    op.drop_column("reports", "assigned_to_name")
