from __future__ import annotations
from typing import Optional, Dict, Any
from sqlalchemy import String, Boolean, Text, Integer, TIMESTAMP, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    study_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    accession_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="BORRADOR")
    modalidad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    region_anatomica: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    lateralidad: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    claude_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    fhir_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    texto_final: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    has_alert: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_desc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    signed_at: Mapped[Optional[TIMESTAMP]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    signed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signed_by_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    assigned_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sent_to_ris_at: Mapped[Optional[TIMESTAMP]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    ris_ack: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id], back_populates="reports")
    worklist_entry = relationship("Worklist", back_populates="report", uselist=False)
    audit_logs = relationship("AuditLog", back_populates="report")

    __table_args__ = (
        Index("idx_reports_user", "user_id"),
        Index("idx_reports_status", "status"),
        Index("idx_reports_study", "study_id"),
        Index("idx_reports_alert", "has_alert", postgresql_where="has_alert = TRUE"),
    )
