from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime, timezone
from typing import Optional
import uuid as _uuid

from database import get_db
from models.report import Report
from models.user import User
from models.worklist import Worklist
from schemas.claude import ProcessDictationRequest
from schemas.report import ReportOut
from middleware.auth_middleware import get_current_user
from middleware.audit_middleware import log_action
from services import claude_service, fhir_builder, mirth_service


async def _find_worklist(db: AsyncSession, accession_number: Optional[str], study_id: Optional[str]) -> Optional[Worklist]:
    """Busca la entrada del worklist por accession_number o por worklist.id = study_id."""
    conditions = []
    if accession_number:
        conditions.append(Worklist.accession_number == accession_number)
    if study_id:
        try:
            wl_uuid = _uuid.UUID(study_id)
            conditions.append(Worklist.id == wl_uuid)
        except ValueError:
            pass
    if not conditions:
        return None
    result = await db.execute(select(Worklist).where(or_(*conditions)))
    return result.scalars().first()

router = APIRouter(prefix="/api/v1", tags=["dictation"])


@router.post("/process-dictation", response_model=ReportOut)
async def process_dictation(
    body: ProcessDictationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Procesa un dictado de voz: llama a Claude API, guarda el informe y detecta alertas."""
    try:
        claude_result, normalized_transcript = await claude_service.process_dictation(
            body.transcript,
            fewshot_examples=body.fewshot_examples,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al procesar con Claude API: {str(e)}")

    alerta = claude_result.get("alerta_critica", {})
    estudio = claude_result.get("estudio", {})

    fhir = fhir_builder.build_fhir_diagnostic_report(claude_result)

    report = Report(
        user_id=current_user.id,
        study_id=body.study_id,
        accession_number=body.accession_number,
        status="BORRADOR",
        modalidad=estudio.get("modalidad"),
        region_anatomica=estudio.get("region_anatomica"),
        lateralidad=estudio.get("lateralidad"),
        raw_transcript=normalized_transcript,
        claude_json=claude_result,
        fhir_json=fhir,
        texto_final=claude_result.get("texto_informe_final"),
        has_alert=alerta.get("activa", False),
        alert_desc=alerta.get("descripcion") if alerta.get("activa") else None,
    )
    db.add(report)
    await db.flush()

    # Link worklist entry to report (by accession_number OR worklist.id = study_id)
    wl = await _find_worklist(db, body.accession_number, body.study_id)
    if wl:
        wl.report_id = report.id

    await log_action(
        db, current_user.id, "PROCESS",
        report_id=report.id,
        ip_address=request.client.host,
        detail={"modalidad": estudio.get("modalidad"), "has_alert": report.has_alert},
    )

    # Build response with patient demographics if worklist was found
    report_out = ReportOut.model_validate(report)
    if wl:
        report_out.patient_name = wl.patient_name
        report_out.patient_rut = wl.patient_rut
        report_out.patient_dob = str(wl.patient_dob) if wl.patient_dob else None
        report_out.patient_sex = wl.patient_sex
        report_out.patient_phone = wl.patient_phone
        report_out.patient_email = wl.patient_email
        report_out.patient_address = wl.patient_address
        report_out.patient_commune = wl.patient_commune
        report_out.patient_region = wl.patient_region
    return report_out


@router.patch("/reports/{report_id}/sign", response_model=ReportOut)
async def sign_report(
    report_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Firma un informe (RADIOLOGO o JEFE_SERVICIO puede firmar)."""
    if current_user.role not in ("RADIOLOGO", "JEFE_SERVICIO", "ADMIN"):
        raise HTTPException(status_code=403, detail="Solo radiólogos pueden firmar informes")

    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status == "FIRMADO":
        raise HTTPException(status_code=400, detail="El informe ya está firmado")

    report.status = "FIRMADO"
    report.signed_at = datetime.now(timezone.utc)
    report.signed_by_id = current_user.id
    report.signed_by_name = current_user.full_name
    report.version += 1

    # Sync worklist entry status (by report_id, accession_number, or worklist.id = study_id)
    worklist = None
    wl_result = await db.execute(
        select(Worklist).where(Worklist.report_id == report.id)
    )
    worklist = wl_result.scalars().first()
    if not worklist:
        worklist = await _find_worklist(db, report.accession_number, report.study_id)
    if worklist:
        worklist.status = "INFORMADO"
        if not worklist.report_id:
            worklist.report_id = report.id

    await log_action(db, current_user.id, "SIGN", report_id=report.id, ip_address=request.client.host)
    return ReportOut.model_validate(report)


@router.post("/reports/{report_id}/send-ris", response_model=ReportOut)
async def send_to_ris(
    report_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Envía el informe firmado al RIS vía Mirth Connect (HL7 v2)."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    if report.status != "FIRMADO":
        raise HTTPException(status_code=400, detail="Solo se pueden enviar informes firmados")

    try:
        ack = await mirth_service.send_to_mirth(report.fhir_json or {})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al enviar a Mirth Connect: {str(e)}")

    report.status = "ENVIADO"
    report.sent_to_ris_at = datetime.now(timezone.utc)
    report.ris_ack = ack

    # Sync worklist entry status (by report_id, accession_number, or worklist.id = study_id)
    wl_result = await db.execute(
        select(Worklist).where(Worklist.report_id == report.id)
    )
    worklist = wl_result.scalars().first()
    if not worklist:
        worklist = await _find_worklist(db, report.accession_number, report.study_id)
    if worklist:
        worklist.status = "ENVIADO"
        if not worklist.report_id:
            worklist.report_id = report.id

    await log_action(db, current_user.id, "SEND_RIS", report_id=report.id, detail={"ack": ack[:200] if ack else None})
    return ReportOut.model_validate(report)
