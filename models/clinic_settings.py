from __future__ import annotations
from typing import Optional
from sqlalchemy import String, Text, Integer, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from database import Base


class ClinicSettings(Base):
    """Configuración personalizable de la clínica/centro (singleton, id=1)."""
    __tablename__ = "clinic_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    institution_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Centro de Imágenes Médicas")
    institution_subtitle: Mapped[str] = mapped_column(String(200), nullable=False, default="Servicio de Radiología e Imágenes")
    report_title: Mapped[str] = mapped_column(String(100), nullable=False, default="INFORME RADIOLÓGICO")
    footer_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    updated_at: Mapped[TIMESTAMP] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
