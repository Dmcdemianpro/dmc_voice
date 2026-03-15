from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional

from database import get_db
from models.worklist import Worklist
from middleware.auth_middleware import get_current_user
from models.user import User

router = APIRouter(prefix="/api/v1/patients", tags=["patients"], redirect_slashes=False)


def _patient_dict(w: Worklist) -> dict:
    return {
        "patient_rut":     w.patient_rut,
        "patient_name":    w.patient_name,
        "patient_dob":     w.patient_dob.isoformat() if w.patient_dob else None,
        "patient_sex":     w.patient_sex,
        "patient_phone":   w.patient_phone,
        "patient_email":   w.patient_email,
        "patient_address": w.patient_address,
        "patient_commune": w.patient_commune,
        "patient_region":  w.patient_region,
        "prevision":       w.prevision,
        "isapre_nombre":   w.isapre_nombre,
    }


@router.get("/search")
async def search_patients(
    q: str = Query(..., min_length=2, description="RUT o nombre del paciente"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca pacientes existentes en el historial del worklist.
    Devuelve demografía única deduplicada por RUT.
    """
    q_lower = f"%{q.lower()}%"

    result = await db.execute(
        select(Worklist)
        .where(
            or_(
                Worklist.patient_rut.ilike(q_lower),
                Worklist.patient_name.ilike(q_lower),
            )
        )
        .where(Worklist.patient_rut.isnot(None))
        .order_by(Worklist.received_at.desc())
        .limit(50)
    )
    rows = result.scalars().all()

    # Deduplicar por RUT conservando el registro más reciente
    seen: dict[str, dict] = {}
    for row in rows:
        rut = row.patient_rut or ""
        if rut and rut not in seen:
            seen[rut] = _patient_dict(row)

    return list(seen.values())
