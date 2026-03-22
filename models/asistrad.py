from __future__ import annotations
from typing import Optional, Dict, Any
from sqlalchemy import String, Boolean, Text, Integer, TIMESTAMP, ForeignKey, Index, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base


class RadTemplate(Base):
    __tablename__ = "rad_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    modality: Mapped[str] = mapped_column(String(30), nullable=False)
    region: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    template_text: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
    versions = relationship("RadTemplateVersion", back_populates="template", order_by="RadTemplateVersion.version_number.desc()")

    __table_args__ = (
        Index("idx_rad_templates_modality", "modality"),
        Index("idx_rad_templates_region", "region"),
        Index("idx_rad_templates_active", "is_active"),
        Index("idx_rad_templates_modality_region", "modality", "region"),
    )


class RadTemplateVersion(Base):
    __tablename__ = "rad_template_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rad_templates.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    template_text: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    template = relationship("RadTemplate", back_populates="versions")

    __table_args__ = (
        Index("idx_rad_template_versions_template", "template_id"),
    )


class RadReportHistory(Base):
    __tablename__ = "rad_report_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("rad_templates.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    modality: Mapped[str] = mapped_column(String(30), nullable=False)
    region: Mapped[str] = mapped_column(String(200), nullable=False)
    clinical_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_sent: Mapped[str] = mapped_column(Text, nullable=False)
    response_received: Mapped[str] = mapped_column(Text, nullable=False)
    findings_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    finding_category: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    pipeline_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    report = relationship("Report", foreign_keys=[report_id])
    template = relationship("RadTemplate", foreign_keys=[template_id])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_rating_range"),
        Index("idx_rad_report_history_template", "template_id"),
        Index("idx_rad_report_history_report", "report_id"),
        Index("idx_rad_report_history_user", "user_id"),
        Index("idx_rad_report_history_modality_region", "modality", "region"),
    )
