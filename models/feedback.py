"""
Modelos para el sistema de Feedback Loop, Few-Shot Learning y Fine-tuning.

Tablas:
  - report_sessions   : sesión de trabajo de un radiólogo en un informe
  - correction_pairs  : par original Claude ↔ texto corregido por el radiólogo
  - training_examples : ejemplos validados listos para fine-tuning, con embeddings
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
from sqlalchemy import (
    String, Boolean, Text, Integer, Float, TIMESTAMP, ForeignKey, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base


class ReportSession(Base):
    """Registra el tiempo y actividad de edición de cada informe."""
    __tablename__ = "report_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    ended_at: Mapped[Optional[TIMESTAMP]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    # Métricas de edición capturadas por el hook React
    edit_count: Mapped[int] = mapped_column(Integer, default=0)
    keystrokes: Mapped[int] = mapped_column(Integer, default=0)
    time_to_sign_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    audio_duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    transcript_length: Mapped[int] = mapped_column(Integer, default=0)

    report = relationship("Report", foreign_keys=[report_id])
    correction_pair = relationship("CorrectionPair", back_populates="session", uselist=False)

    __table_args__ = (
        Index("idx_sessions_report", "report_id"),
        Index("idx_sessions_user", "user_id"),
    )


class CorrectionPair(Base):
    """Par de texto: lo que generó Claude vs. lo que firmó el radiólogo.
    Este es el dato central del feedback loop.
    """
    __tablename__ = "correction_pairs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("report_sessions.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Los dos textos que se comparan
    original_text: Mapped[str] = mapped_column(Text, nullable=False)   # Claude generó esto
    corrected_text: Mapped[str] = mapped_column(Text, nullable=False)  # Radiólogo firmó esto
    # Diff calculado por diff_service
    diff_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    diff_score: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        comment="0 = idéntico, 100 = completamente diferente"
    )
    similarity_ratio: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        comment="difflib similarity ratio 0–1"
    )
    # Contexto del estudio
    modalidad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    region_anatomica: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    session = relationship("ReportSession", back_populates="correction_pair")
    training_example = relationship("TrainingExample", back_populates="correction_pair", uselist=False)

    __table_args__ = (
        Index("idx_pairs_report", "report_id"),
        Index("idx_pairs_user", "user_id"),
        Index("idx_pairs_modalidad", "modalidad"),
        Index("idx_pairs_score", "diff_score"),
    )


class TrainingExample(Base):
    """Ejemplos de alta calidad validados para few-shot y fine-tuning.
    Se crean automáticamente desde correction_pairs cuando diff_score < umbral,
    o manualmente por el jefe de servicio/admin.
    """
    __tablename__ = "training_examples"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    correction_pair_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("correction_pairs.id", ondelete="CASCADE"), nullable=False
    )
    # Texto para el pipeline de entrenamiento
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    corrected_text: Mapped[str] = mapped_column(Text, nullable=False)
    modalidad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    region_anatomica: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Calidad y estado
    quality_score: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        comment="0–1, calculado desde diff_score + tiempo de firma"
    )
    is_validated: Mapped[bool] = mapped_column(
        Boolean, default=False,
        comment="Marcado como bueno para entrenamiento por un JEFE_SERVICIO/ADMIN"
    )
    used_for_fewshot: Mapped[bool] = mapped_column(Boolean, default=True)
    used_for_finetune: Mapped[bool] = mapped_column(Boolean, default=False)
    # Embedding del transcript para búsqueda por similitud (pgvector)
    # Se almacena como JSONB hasta que se instale pgvector; luego migrar a Vector(384)
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        JSONB, nullable=True,
        comment="Vector 384-dim de sentence-transformers (paraphrase-multilingual-MiniLM-L12-v2)"
    )
    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    correction_pair = relationship("CorrectionPair", back_populates="training_example")

    __table_args__ = (
        Index("idx_examples_modalidad", "modalidad"),
        Index("idx_examples_validated", "is_validated"),
        Index("idx_examples_fewshot", "used_for_fewshot"),
    )
