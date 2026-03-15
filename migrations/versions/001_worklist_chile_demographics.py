"""worklist: demografía chilena completa

Revision ID: 001
Revises:
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("worklist", sa.Column("medico_derivador",   sa.String(200), nullable=True))
    op.add_column("worklist", sa.Column("servicio_solicitante", sa.String(100), nullable=True))
    op.add_column("worklist", sa.Column("patient_phone",      sa.String(20),  nullable=True))
    op.add_column("worklist", sa.Column("patient_email",      sa.String(150), nullable=True))
    op.add_column("worklist", sa.Column("patient_address",    sa.String(300), nullable=True))
    op.add_column("worklist", sa.Column("patient_commune",    sa.String(100), nullable=True))
    op.add_column("worklist", sa.Column("patient_region",     sa.String(80),  nullable=True))
    op.add_column("worklist", sa.Column("prevision",          sa.String(20),  nullable=True))
    op.add_column("worklist", sa.Column("isapre_nombre",      sa.String(100), nullable=True))
    op.add_column("worklist", sa.Column("source",             sa.String(20),  nullable=False,
                                        server_default="MANUAL"))


def downgrade() -> None:
    for col in ["source", "isapre_nombre", "prevision", "patient_region",
                "patient_commune", "patient_address", "patient_email",
                "patient_phone", "servicio_solicitante", "medico_derivador"]:
        op.drop_column("worklist", col)
