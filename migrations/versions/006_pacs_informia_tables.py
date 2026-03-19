"""PACS study_reports + InformIA tables

Revision ID: 006
Revises: 005
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # informia_templates must be created BEFORE study_reports (FK dependency)
    op.create_table(
        "informia_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("radiologo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("modalidad", sa.String(10), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("contenido", sa.Text, nullable=False),
        sa.Column("uso_count", sa.Integer, server_default="0"),
        sa.Column("activo", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "study_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("study_instance_uid", sa.String(128), nullable=False),
        sa.Column("accession_number", sa.String(64), nullable=True),
        sa.Column("patient_id", sa.String(64), nullable=True),
        sa.Column("patient_name", sa.String(255), nullable=True),
        sa.Column("study_date", sa.Date, nullable=True),
        sa.Column("modality", sa.String(10), nullable=True),
        sa.Column("study_description", sa.String(500), nullable=True),
        sa.Column("report_status", sa.String(20), server_default="draft"),
        sa.Column("report_title", sa.String(500), nullable=True),
        sa.Column("report_body", sa.Text, nullable=True),
        sa.Column("report_impression", sa.Text, nullable=True),
        sa.Column("report_observations", sa.Text, nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("informia_templates.id"), nullable=True),
        sa.Column("was_informia", sa.Boolean, server_default="false"),
        sa.Column("dictation_text", sa.Text, nullable=True),
        sa.Column("dicom_analysis_json", postgresql.JSONB, nullable=True),
        sa.Column("dicom_context_text", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("finalized_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    op.create_table(
        "informia_informes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("radiologo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("informia_templates.id"), nullable=True),
        sa.Column("study_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("study_reports.id"), nullable=True),
        sa.Column("modalidad", sa.String(10), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("hallazgos_input", sa.Text, nullable=False),
        sa.Column("dicom_analizado", sa.Boolean, server_default="false"),
        sa.Column("dicom_analysis_json", postgresql.JSONB, nullable=True),
        sa.Column("preinforme_generado", sa.Text, nullable=False),
        sa.Column("informe_final", sa.Text, nullable=True),
        sa.Column("fue_editado", sa.Boolean, server_default="false"),
        sa.Column("diferencia_chars", sa.Integer, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("finalizado_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    op.create_table(
        "informia_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("radiologo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("few_shot_count", sa.Integer, server_default="3"),
        sa.Column("temperatura", sa.Float, server_default="0.3"),
        sa.Column("incluir_observaciones", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )

    # Indexes
    op.create_index("idx_study_reports_uid", "study_reports", ["study_instance_uid"])
    op.create_index("idx_study_reports_accession", "study_reports", ["accession_number"])
    op.create_index("idx_study_reports_patient", "study_reports", ["patient_id"])
    op.create_index("idx_study_reports_status", "study_reports", ["report_status"])
    op.create_index("idx_informia_informes_rad", "informia_informes", ["radiologo_id", "modalidad"])


def downgrade() -> None:
    op.drop_index("idx_informia_informes_rad")
    op.drop_index("idx_study_reports_status")
    op.drop_index("idx_study_reports_patient")
    op.drop_index("idx_study_reports_accession")
    op.drop_index("idx_study_reports_uid")
    op.drop_table("informia_config")
    op.drop_table("informia_informes")
    op.drop_table("study_reports")
    op.drop_table("informia_templates")
