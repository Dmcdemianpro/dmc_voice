from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Literal, Union
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models.worklist import Worklist
from middleware.auth_middleware import get_current_user, require_roles
from models.user import User
from config import settings
from services import orthanc_service

router = APIRouter(prefix="/api/v1/worklist", tags=["worklist"], redirect_slashes=False)

# ── Schemas ───────────────────────────────────────────────────────────────────

class PatientDemographics(BaseModel):
    """Demografía chilena reutilizada en creación manual e integración."""
    patient_name: Optional[str] = None
    patient_rut: Optional[str] = None
    patient_dob: Optional[str] = None          # ISO date YYYY-MM-DD
    patient_sex: Optional[Literal["M", "F", "I"]] = None
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    patient_address: Optional[str] = None
    patient_commune: Optional[str] = None
    patient_region: Optional[str] = None       # región administrativa Chile
    prevision: Optional[str] = None            # FONASA_A/B/C/D | ISAPRE | PARTICULAR | OTRO
    isapre_nombre: Optional[str] = None


class WorklistCreate(PatientDemographics):
    """Creación manual desde el frontend."""
    accession_number: str
    study_id: Optional[str] = None
    modalidad: Optional[str] = None
    region: Optional[str] = None              # región anatómica (Tórax, Abdomen…)
    scheduled_at: Optional[str] = None        # ISO datetime
    medico_derivador: Optional[str] = None
    servicio_solicitante: Optional[str] = None


class WorklistIntegrationCreate(PatientDemographics):
    """Payload de sistemas externos (RIS, HIS, HL7 gateway, FHIR server)."""
    accession_number: str
    study_id: Optional[str] = None
    modalidad: Optional[str] = None
    region: Optional[str] = None
    scheduled_at: Optional[str] = None
    medico_derivador: Optional[str] = None
    servicio_solicitante: Optional[str] = None
    source: Optional[Literal["HL7", "FHIR", "API"]] = "API"


# ── Helper ────────────────────────────────────────────────────────────────────

def _build_item(body: Union[WorklistCreate, WorklistIntegrationCreate], source: str = "MANUAL") -> Worklist:
    return Worklist(
        accession_number=body.accession_number,
        study_id=body.study_id,
        modalidad=body.modalidad,
        region=body.region,
        scheduled_at=datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else None,
        medico_derivador=body.medico_derivador,
        servicio_solicitante=body.servicio_solicitante,
        patient_name=body.patient_name,
        patient_rut=body.patient_rut,
        patient_dob=datetime.fromisoformat(body.patient_dob).date() if body.patient_dob else None,
        patient_sex=body.patient_sex,
        patient_phone=body.patient_phone,
        patient_email=body.patient_email,
        patient_address=body.patient_address,
        patient_commune=body.patient_commune,
        patient_region=body.patient_region,
        prevision=body.prevision,
        isapre_nombre=body.isapre_nombre,
        source=source,
        status="PENDIENTE",
    )


def _serialize(item: Worklist) -> dict:
    return {
        "id": str(item.id),
        "accession_number": item.accession_number,
        "study_id": item.study_id,
        "modalidad": item.modalidad,
        "region": item.region,
        "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None,
        "medico_derivador": item.medico_derivador,
        "servicio_solicitante": item.servicio_solicitante,
        "patient_name": item.patient_name,
        "patient_rut": item.patient_rut,
        "patient_dob": item.patient_dob.isoformat() if item.patient_dob else None,
        "patient_sex": item.patient_sex,
        "patient_phone": item.patient_phone,
        "patient_email": item.patient_email,
        "patient_address": item.patient_address,
        "patient_commune": item.patient_commune,
        "patient_region": item.patient_region,
        "prevision": item.prevision,
        "isapre_nombre": item.isapre_nombre,
        "source": item.source,
        "status": item.status,
        "report_id": str(item.report_id) if item.report_id else None,
        "received_at": item.received_at.isoformat() if item.received_at else None,
        "assigned_to_id": str(item.assigned_to_id) if item.assigned_to_id else None,
        "assigned_to_name": item.assigned_to_name,
        "has_images": item.has_images,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
async def create_worklist_item(
    body: WorklistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO", "TECNOLOGO")),
):
    """Crea un estudio manualmente desde el sistema."""
    existing = await db.execute(select(Worklist).where(Worklist.accession_number == body.accession_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El número de acceso ya existe")

    item = _build_item(body, source="MANUAL")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _serialize(item)


@router.post("/integration", status_code=201)
async def integration_receive(
    body: WorklistIntegrationCreate,
    db: AsyncSession = Depends(get_db),
    x_integration_token: Optional[str] = Header(default=None),
):
    """
    Recibe pacientes/estudios desde sistemas externos (RIS, HIS, HL7 gateway, FHIR).

    Autenticación: cabecera `X-Integration-Token: <token>`.
    Configura la variable INTEGRATION_TOKEN en .env.
    Si no está definida, se acepta cualquier llamada (modo desarrollo).
    """
    integration_token = getattr(settings, "integration_token", None)
    if integration_token and x_integration_token != integration_token:
        raise HTTPException(status_code=401, detail="Token de integración inválido")

    existing = await db.execute(select(Worklist).where(Worklist.accession_number == body.accession_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El número de acceso ya existe")

    item = _build_item(body, source=body.source or "API")

    # Consultar PACS automáticamente si Orthanc está configurado
    item.has_images = await orthanc_service.study_has_images(body.accession_number)

    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _serialize(item)


@router.get("")
@router.get("/", include_in_schema=False)
async def list_worklist(
    status: Optional[str] = "PENDIENTE",
    modalidad: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_
    query = select(Worklist)
    if status:
        query = query.where(Worklist.status == status)
    if modalidad:
        query = query.where(Worklist.modalidad == modalidad)

    # Radiólogos solo ven sus estudios asignados (no los sin asignar)
    if current_user.role == "RADIOLOGO":
        query = query.where(Worklist.assigned_to_id == current_user.id)

    query = query.order_by(Worklist.scheduled_at.asc()).limit(100)
    result = await db.execute(query)
    return [_serialize(w) for w in result.scalars().all()]


@router.get("/{worklist_id}")
async def get_worklist_item(
    worklist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Worklist).where(Worklist.id == worklist_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Estudio no encontrado en la worklist")
    return _serialize(item)


class WorklistAssign(BaseModel):
    assigned_to_id: Optional[str] = None  # None = desasignar


@router.patch("/{worklist_id}/assign")
async def assign_worklist_item(
    worklist_id: str,
    body: WorklistAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    """Asigna (o desasigna) un radiólogo a un estudio del worklist."""
    result = await db.execute(select(Worklist).where(Worklist.id == worklist_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Estudio no encontrado en la worklist")

    if body.assigned_to_id:
        user_result = await db.execute(select(User).where(User.id == body.assigned_to_id))
        assigned_user = user_result.scalar_one_or_none()
        if not assigned_user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if assigned_user.role not in ("RADIOLOGO", "JEFE_SERVICIO"):
            raise HTTPException(status_code=400, detail="Solo se puede asignar a radiólogos o jefes de servicio")
        item.assigned_to_id = assigned_user.id
        item.assigned_to_name = assigned_user.full_name
    else:
        item.assigned_to_id = None
        item.assigned_to_name = None

    await db.commit()
    await db.refresh(item)
    return _serialize(item)


@router.patch("/{worklist_id}/toggle-images")
async def toggle_images(
    worklist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO", "TECNOLOGO")),
):
    """Marca/desmarca que el estudio tiene imágenes disponibles."""
    result = await db.execute(select(Worklist).where(Worklist.id == worklist_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Estudio no encontrado en la worklist")

    item.has_images = not item.has_images
    await db.commit()
    await db.refresh(item)
    return _serialize(item)
