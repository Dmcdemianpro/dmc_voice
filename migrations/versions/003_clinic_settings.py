"""clinic_settings table

Revision ID: 003
Revises: 002
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinic_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("institution_name", sa.String(200), nullable=False, server_default="Centro de Imágenes Médicas"),
        sa.Column("institution_subtitle", sa.String(200), nullable=False, server_default="Servicio de Radiología e Imágenes"),
        sa.Column("report_title", sa.String(100), nullable=False, server_default="INFORME RADIOLÓGICO"),
        sa.Column("footer_text", sa.Text(), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(150), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    # Seed default row (singleton id=1)
    op.execute("""
        INSERT INTO clinic_settings (id, institution_name, institution_subtitle, report_title)
        VALUES (1, 'Centro de Imágenes Médicas', 'Servicio de Radiología e Imágenes', 'INFORME RADIOLÓGICO')
        ON CONFLICT DO NOTHING
    """)


def downgrade():
    op.drop_table("clinic_settings")
