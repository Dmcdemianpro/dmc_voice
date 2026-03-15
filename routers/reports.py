import io
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import Optional

from database import get_db
from models.report import Report
from models.user import User
from models.worklist import Worklist
from models.clinic_settings import ClinicSettings
from schemas.report import ReportCreate, ReportOut, ReportUpdate, ReportListOut, ReportAssign, ReportLinkWorklist, ReportInvalidate
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
from middleware.auth_middleware import get_current_user, require_roles
from middleware.audit_middleware import log_action
from services import pdf_service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"], redirect_slashes=False)


def _report_out(report: Report) -> ReportOut:
    """Build ReportOut, merging patient demographics from linked Worklist if available."""
    data = ReportOut.model_validate(report)
    wl = getattr(report, "worklist_entry", None)
    if wl:
        data.patient_name = wl.patient_name
        data.patient_rut = wl.patient_rut
        data.patient_dob = str(wl.patient_dob) if wl.patient_dob else None
        data.patient_sex = wl.patient_sex
        data.patient_phone = wl.patient_phone
        data.patient_email = wl.patient_email
        data.patient_address = wl.patient_address
        data.patient_commune = wl.patient_commune
        data.patient_region = wl.patient_region
    return data


@router.post("", response_model=ReportOut, status_code=201)
@router.post("/", response_model=ReportOut, status_code=201, include_in_schema=False)
async def create_report(
    body: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea un informe manualmente sin procesamiento AI (raw_transcript como texto_final)."""
    report = Report(
        user_id=current_user.id,
        study_id=body.study_id,
        accession_number=body.accession_number,
        raw_transcript=body.raw_transcript,
        texto_final=body.raw_transcript,
        status="BORRADOR",
    )
    db.add(report)
    await db.flush()

    # Link worklist entry to report so patient demographics are accessible
    if body.accession_number:
        wl_result = await db.execute(
            select(Worklist).where(Worklist.accession_number == body.accession_number)
        )
        wl = wl_result.scalar_one_or_none()
        if wl:
            wl.report_id = report.id

    await db.commit()
    await db.refresh(report)
    return ReportOut.model_validate(report)


@router.get("", response_model=ReportListOut)
@router.get("/", response_model=ReportListOut, include_in_schema=False)
async def list_reports(
    page: int = 1,
    per_page: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Report)
    # Admin y Jefe ven todos; Radiólogo solo los que creó o tiene asignados
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        query = query.where(
            or_(
                Report.user_id == current_user.id,
                Report.assigned_to_id == current_user.id,
            )
        )
    if status:
        query = query.where(Report.status == status)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = (
        query
        .options(selectinload(Report.worklist_entry))
        .order_by(Report.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    reports = result.scalars().all()

    return ReportListOut(
        items=[_report_out(r) for r in reports],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/alerts", response_model=list[ReportOut])
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos los informes con alertas críticas activas."""
    q = select(Report).where(Report.has_alert == True)
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        q = q.where(
            or_(
                Report.user_id == current_user.id,
                Report.assigned_to_id == current_user.id,
            )
        )
    result = await db.execute(
        q.options(selectinload(Report.worklist_entry))
        .order_by(Report.created_at.desc()).limit(50)
    )
    reports = result.scalars().all()
    return [_report_out(r) for r in reports]


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.worklist_entry))
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        if report.user_id != current_user.id and report.assigned_to_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sin acceso a este informe")
    return _report_out(report)


@router.patch("/{report_id}", response_model=ReportOut)
async def update_report(
    report_id: str,
    body: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status in ("FIRMADO", "ENVIADO"):
        raise HTTPException(status_code=400, detail="No se puede editar un informe firmado o enviado")

    if body.texto_final is not None:
        report.texto_final = body.texto_final
    if body.status is not None:
        report.status = body.status

    await db.commit()
    await db.refresh(report)
    return ReportOut.model_validate(report)


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar informes en estado BORRADOR")
    if report.user_id != current_user.id and current_user.role not in ("ADMIN",):
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar este informe")

    await db.delete(report)
    await db.commit()
    return {"message": "Informe eliminado"}


@router.patch("/{report_id}/invalidate", response_model=ReportOut)
async def invalidate_report(
    report_id: str,
    body: ReportInvalidate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    """Revierte un informe FIRMADO o ENVIADO a BORRADOR (solo ADMIN / JEFE_SERVICIO).
    Requiere confirmación de credenciales del usuario que realiza la acción."""
    # Verify password
    if not pwd_context.verify(body.password, current_user.hashed_pw):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status not in ("FIRMADO", "ENVIADO"):
        raise HTTPException(status_code=400, detail="Solo se pueden invalidar informes FIRMADO o ENVIADO")

    previous_status = report.status
    previous_signed_by = report.signed_by_name
    previous_signed_at = report.signed_at.isoformat() if report.signed_at else None

    report.status = "BORRADOR"
    report.signed_at = None
    report.signed_by_id = None
    report.signed_by_name = None
    report.sent_to_ris_at = None
    report.ris_ack = None
    await db.commit()
    await db.refresh(report)
    await log_action(
        db, current_user.id, "INVALIDATE",
        report_id=report.id,
        ip_address=request.client.host,
        detail={
            "previous_status": previous_status,
            "signed_by": previous_signed_by,
            "signed_at": previous_signed_at,
            "invalidated_by": current_user.full_name,
            "reason": body.reason or "",
            "password_verified": True,
        }
    )
    return ReportOut.model_validate(report)


@router.patch("/{report_id}/assign", response_model=ReportOut)
async def assign_report(
    report_id: str,
    body: ReportAssign,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "JEFE_SERVICIO")),
):
    """Asigna un informe a un radiólogo (solo ADMIN / JEFE_SERVICIO)."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo se pueden asignar informes en estado BORRADOR")

    user_result = await db.execute(select(User).where(User.id == body.assigned_to_id))
    assigned_user = user_result.scalar_one_or_none()
    if not assigned_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if assigned_user.role not in ("RADIOLOGO", "JEFE_SERVICIO"):
        raise HTTPException(status_code=400, detail="Solo se puede asignar a radiólogos")

    report.assigned_to_id = assigned_user.id
    report.assigned_to_name = assigned_user.full_name
    await db.commit()
    await db.refresh(report)
    await log_action(db, current_user.id, "ASSIGN", report_id=report.id, ip_address=request.client.host,
                     detail={"assigned_to": str(assigned_user.id)})
    return ReportOut.model_validate(report)


@router.patch("/{report_id}/link-worklist", response_model=ReportOut)
async def link_worklist(
    report_id: str,
    body: ReportLinkWorklist,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vincula manualmente un informe a una entrada del worklist para asociar datos del paciente."""
    result = await db.execute(
        select(Report).options(selectinload(Report.worklist_entry)).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if current_user.role not in ("ADMIN", "JEFE_SERVICIO") and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso para vincular este informe")

    wl_result = await db.execute(select(Worklist).where(Worklist.id == body.worklist_id))
    wl = wl_result.scalar_one_or_none()
    if not wl:
        raise HTTPException(status_code=404, detail="Entrada de worklist no encontrada")

    # Desvincular el worklist anterior si existe
    if report.worklist_entry:
        old_wl = report.worklist_entry
        old_wl.report_id = None

    # Vincular el nuevo worklist
    wl.report_id = report.id
    if not report.accession_number:
        report.accession_number = wl.accession_number

    # Sync worklist status with the report's current status
    if report.status == "ENVIADO":
        wl.status = "ENVIADO"
    elif report.status == "FIRMADO":
        wl.status = "INFORMADO"

    await db.commit()
    await db.refresh(report)

    out = ReportOut.model_validate(report)
    out.patient_name = wl.patient_name
    out.patient_rut = wl.patient_rut
    out.patient_dob = str(wl.patient_dob) if wl.patient_dob else None
    out.patient_sex = wl.patient_sex
    out.patient_phone = wl.patient_phone
    out.patient_email = wl.patient_email
    out.patient_address = wl.patient_address
    out.patient_commune = wl.patient_commune
    out.patient_region = wl.patient_region
    return out


@router.post("/{report_id}/pdf")
async def generate_pdf(
    report_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera el PDF del informe y lo retorna como streaming response."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status != "FIRMADO" and current_user.role not in ("ADMIN", "JEFE_SERVICIO"):
        raise HTTPException(status_code=403, detail="Solo se pueden exportar informes firmados")

    # Load clinic settings (singleton row id=1)
    cs_result = await db.execute(select(ClinicSettings).where(ClinicSettings.id == 1))
    clinic = cs_result.scalar_one_or_none()

    # Load worklist entry for patient demographics
    wl_result = await db.execute(
        select(Worklist).where(
            (Worklist.report_id == report.id) |
            (Worklist.accession_number == report.accession_number)
        )
    )
    worklist = wl_result.scalars().first()

    try:
        pdf_bytes = await pdf_service.generate_pdf(report, current_user, clinic=clinic, worklist=worklist)
        pdf_path = await pdf_service.save_pdf(report_id, pdf_bytes)
        report.pdf_url = pdf_path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")

    await log_action(
        db, current_user.id, "EXPORT_PDF",
        report_id=report.id,
        ip_address=request.client.host,
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=informe_{report_id}.pdf"},
    )
