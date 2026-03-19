from __future__ import annotations
from typing import Optional, Dict, Any
from sqlalchemy import String, Boolean, Text, Integer, Float, Date, TIMESTAMP, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base


class StudyReport(Base):
    __tablename__ = "study_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    study_instance_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    accession_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    patient_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    study_date: Mapped[Optional[Date]] = mapped_column(Date, nullable=True)
    modality: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    study_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    report_status: Mapped[str] = mapped_column(String(20), default="draft")
    report_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    report_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    report_impression: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    report_observations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("informia_templates.id"), nullable=True)
    was_informia: Mapped[bool] = mapped_column(Boolean, default=False)
    dictation_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dicom_analysis_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    dicom_context_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    finalized_at: Mapped[Optional[TIMESTAMP]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_study_reports_uid", "study_instance_uid"),
        Index("idx_study_reports_accession", "accession_number"),
        Index("idx_study_reports_patient", "patient_id"),
        Index("idx_study_reports_status", "report_status"),
    )


class InformiaTemplate(Base):
    __tablename__ = "informia_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    radiologo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    modalidad: Mapped[str] = mapped_column(String(10), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    contenido: Mapped[str] = mapped_column(Text, nullable=False)
    uso_count: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())


class InformiaInforme(Base):
    __tablename__ = "informia_informes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    radiologo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("informia_templates.id"), nullable=True)
    study_report_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("study_reports.id"), nullable=True)
    modalidad: Mapped[str] = mapped_column(String(10), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    hallazgos_input: Mapped[str] = mapped_column(Text, nullable=False)
    dicom_analizado: Mapped[bool] = mapped_column(Boolean, default=False)
    dicom_analysis_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    preinforme_generado: Mapped[str] = mapped_column(Text, nullable=False)
    informe_final: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fue_editado: Mapped[bool] = mapped_column(Boolean, default=False)
    diferencia_chars: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    finalizado_at: Mapped[Optional[TIMESTAMP]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_informia_informes_rad", "radiologo_id", "modalidad"),
    )


class InformiaConfig(Base):
    __tablename__ = "informia_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    radiologo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    few_shot_count: Mapped[int] = mapped_column(Integer, default=3)
    temperatura: Mapped[float] = mapped_column(Float, default=0.3)
    incluir_observaciones: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
