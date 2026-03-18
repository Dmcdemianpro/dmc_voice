"""AsistRad: rad_templates, rad_template_versions, rad_report_history

Revision ID: 005
Revises: 004
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── rad_templates ────────────────────────────────────────────────────────
    op.create_table(
        "rad_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("modality", sa.String(30), nullable=False),
        sa.Column("region", sa.String(200), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_text", sa.Text(), nullable=False),
        sa.Column("variables", postgresql.JSONB(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_rad_templates_modality", "rad_templates", ["modality"])
    op.create_index("idx_rad_templates_region", "rad_templates", ["region"])
    op.create_index("idx_rad_templates_active", "rad_templates", ["is_active"])
    op.create_index("idx_rad_templates_modality_region", "rad_templates", ["modality", "region"])

    # ── rad_template_versions ────────────────────────────────────────────────
    op.create_table(
        "rad_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rad_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("template_text", sa.Text(), nullable=False),
        sa.Column("variables", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_rad_template_versions_template", "rad_template_versions", ["template_id"])

    # ── rad_report_history ───────────────────────────────────────────────────
    op.create_table(
        "rad_report_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rad_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("modality", sa.String(30), nullable=False),
        sa.Column("region", sa.String(200), nullable=False),
        sa.Column("clinical_context", sa.Text(), nullable=True),
        sa.Column("prompt_sent", sa.Text(), nullable=False),
        sa.Column("response_received", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_rating_range"),
    )
    op.create_index("idx_rad_report_history_template", "rad_report_history", ["template_id"])
    op.create_index("idx_rad_report_history_report", "rad_report_history", ["report_id"])
    op.create_index("idx_rad_report_history_user", "rad_report_history", ["user_id"])
    op.create_index("idx_rad_report_history_modality_region", "rad_report_history", ["modality", "region"])


def downgrade() -> None:
    op.drop_table("rad_report_history")
    op.drop_table("rad_template_versions")
    op.drop_table("rad_templates")
