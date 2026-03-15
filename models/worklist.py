from __future__ import annotations
from typing import Optional
from sqlalchemy import String, Date, TIMESTAMP, ForeignKey, CHAR, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from database import Base


class Worklist(Base):
    __tablename__ = "worklist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    accession_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    study_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Datos del estudio ─────────────────────────────────────────────────────
    modalidad: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)       # región anatómica
    scheduled_at: Mapped[Optional[TIMESTAMP]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    medico_derivador: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    servicio_solicitante: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Demografía paciente ───────────────────────────────────────────────────
    patient_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    patient_rut: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    patient_dob: Mapped[Optional[Date]] = mapped_column(Date, nullable=True)
    patient_sex: Mapped[Optional[str]] = mapped_column(CHAR(1), nullable=True)       # M / F / I
    patient_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    patient_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    patient_address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    patient_commune: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    patient_region: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # región administrativa Chile

    # ── Previsión ─────────────────────────────────────────────────────────────
    # FONASA_A | FONASA_B | FONASA_C | FONASA_D | ISAPRE | PARTICULAR | OTRO
    prevision: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    isapre_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Trazabilidad ─────────────────────────────────────────────────────────
    # MANUAL | HL7 | FHIR | API
    source: Mapped[str] = mapped_column(String(20), default="MANUAL", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDIENTE")
    report_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("reports.id"), nullable=True)
    received_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    # ── Asignación de radiólogo ───────────────────────────────────────────────
    assigned_to_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # ── Imágenes disponibles ──────────────────────────────────────────────────
    has_images: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    report = relationship("Report", back_populates="worklist_entry")
