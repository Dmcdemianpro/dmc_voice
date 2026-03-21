from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
import uuid

from database import get_db
from models.user import User
from models.asistrad import RadTemplate, RadTemplateVersion, RadReportHistory
from schemas.asistrad import (
    RadTemplateCreate, RadTemplateUpdate, RadTemplateOut,
    RadTemplateVersionOut,
    RadReportHistoryCreate, RadReportHistoryOut, RatingUpdate,
    AsistRadRequest, AsistRadResponse,
)
from middleware.auth_middleware import get_current_user, require_roles
from services import asistrad_service

router = APIRouter(prefix="/api/v1/asistrad", tags=["asistrad"])


# ── Modalities & Regions (static) ───────────────────────────────────────────

@router.get("/modalities")
async def list_modalities():
    """Lista las modalidades disponibles."""
    return [{"code": k, "name": v} for k, v in asistrad_service.MODALITIES.items()]


@router.get("/regions")
async def list_regions(modality: Optional[str] = Query(None)):
    """Lista las regiones anatómicas disponibles, opcionalmente filtradas por modalidad."""
    if modality:
        regions = asistrad_service.REGIONS_BY_MODALITY.get(modality, [])
        return [{"name": r} for r in regions]
    # All regions grouped
    return {k: v for k, v in asistrad_service.REGIONS_BY_MODALITY.items()}


# ── Templates CRUD ───────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[RadTemplateOut])
async def list_templates(
    modality: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista plantillas con filtros opcionales."""
    query = select(RadTemplate)
    if modality:
        query = query.where(RadTemplate.modality == modality)
    if region:
        query = query.where(RadTemplate.region == region)
    if is_active is not None:
        query = query.where(RadTemplate.is_active == is_active)
    else:
        query = query.where(RadTemplate.is_active == True)  # noqa: E712
    query = query.order_by(RadTemplate.modality, RadTemplate.region, RadTemplate.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/templates/{template_id}", response_model=RadTemplateOut)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(RadTemplate).where(RadTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return template


@router.post("/templates", response_model=RadTemplateOut)
async def create_template(
    body: RadTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    template = RadTemplate(
        modality=body.modality,
        region=body.region,
        name=body.name,
        description=body.description,
        template_text=body.template_text,
        variables=body.variables,
        created_by=current_user.id,
    )
    db.add(template)
    await db.flush()

    # Create initial version
    version = RadTemplateVersion(
        template_id=template.id,
        version_number=1,
        template_text=body.template_text,
        variables=body.variables,
    )
    db.add(version)
    await db.flush()
    await db.refresh(template)
    return template


@router.patch("/templates/{template_id}", response_model=RadTemplateOut)
async def update_template(
    template_id: uuid.UUID,
    body: RadTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    result = await db.execute(select(RadTemplate).where(RadTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    # If template_text changed, create a new version
    if body.template_text is not None and body.template_text != template.template_text:
        # Get current max version number
        ver_result = await db.execute(
            select(func.max(RadTemplateVersion.version_number))
            .where(RadTemplateVersion.template_id == template_id)
        )
        max_ver = ver_result.scalar() or 0
        version = RadTemplateVersion(
            template_id=template_id,
            version_number=max_ver + 1,
            template_text=body.template_text,
            variables=body.variables or template.variables,
        )
        db.add(version)

    # Update fields
    for field in ("name", "description", "template_text", "variables", "is_active"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(template, field, value)

    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    """Soft delete: desactiva la plantilla."""
    result = await db.execute(select(RadTemplate).where(RadTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    template.is_active = False
    await db.flush()
    return {"ok": True}


@router.get("/templates/{template_id}/versions", response_model=list[RadTemplateVersionOut])
async def list_template_versions(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RadTemplateVersion)
        .where(RadTemplateVersion.template_id == template_id)
        .order_by(RadTemplateVersion.version_number.desc())
    )
    return result.scalars().all()


# ── Generate Pre-Report ──────────────────────────────────────────────────────

@router.post("/generate", response_model=AsistRadResponse)
async def generate_pre_report(
    body: AsistRadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera un pre-informe. Pipeline 3 pasos si no se envía template_id y la
    modalidad/región tiene schema. Pipeline legacy si se envía template_id."""
    template = None

    if body.template_id:
        # Pipeline legacy: cargar plantilla
        result = await db.execute(select(RadTemplate).where(RadTemplate.id == body.template_id))
        template = result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=404, detail="Plantilla no encontrada")
        if not template.is_active:
            raise HTTPException(status_code=400, detail="La plantilla está desactivada")

    try:
        pre_report, prompt_sent, findings_json, finding_category = await asistrad_service.generate_pre_report(
            template=template,
            clinical_context=body.clinical_context,
            study_info=body.study_info,
            db=db,
            modality=body.modality,
            region=body.region,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al generar con Claude: {str(e)}")

    # Save history
    history = RadReportHistory(
        template_id=template.id if template else None,
        user_id=current_user.id,
        modality=body.modality,
        region=body.region,
        clinical_context=body.clinical_context,
        prompt_sent=prompt_sent,
        response_received=pre_report,
        findings_json=findings_json,
        finding_category=finding_category,
    )
    db.add(history)
    await db.flush()

    metadata = {
        "history_id": str(history.id),
        "modality": body.modality,
        "region": body.region,
    }
    if template:
        metadata["template_id"] = str(template.id)
    if findings_json:
        metadata["findings_json"] = findings_json
    if finding_category:
        metadata["finding_category"] = finding_category

    return AsistRadResponse(
        pre_report_text=pre_report,
        template_used=template.name if template else f"Auto-clasificación: {finding_category or 'N/A'}",
        metadata=metadata,
    )


# ── History & Rating ─────────────────────────────────────────────────────────

@router.post("/history", response_model=RadReportHistoryOut)
async def save_history(
    body: RadReportHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    history = RadReportHistory(
        report_id=body.report_id,
        template_id=body.template_id,
        user_id=current_user.id,
        modality=body.modality,
        region=body.region,
        clinical_context=body.clinical_context,
        prompt_sent=body.prompt_sent,
        response_received=body.response_received,
    )
    db.add(history)
    await db.flush()
    await db.refresh(history)
    return history


@router.patch("/history/{history_id}/rating", response_model=RadReportHistoryOut)
async def rate_history(
    history_id: uuid.UUID,
    body: RatingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RadReportHistory).where(RadReportHistory.id == history_id)
    )
    history = result.scalar_one_or_none()
    if not history:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if history.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo puedes calificar tus propias generaciones")
    history.rating = body.rating
    history.feedback = body.feedback
    await db.flush()
    await db.refresh(history)
    return history
