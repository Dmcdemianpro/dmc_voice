from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from typing import Optional

from services.pacs_service import pacs_service
from services.dicom_analysis_service import analizar_dicom, analizar_serie, construir_contexto_para_claude
from middleware.auth_middleware import get_current_user
from config import settings

router = APIRouter(prefix="/api/v1/pacs", tags=["PACS"])

MAX_SAMPLE_SLICES = 10


@router.get("/studies")
async def search_studies(
    patient_name: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    study_date: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    accession_number: Optional[str] = Query(None),
    study_description: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    try:
        raw = await pacs_service.search_studies(
            patient_name=patient_name,
            patient_id=patient_id,
            study_date=study_date,
            modality=modality,
            accession_number=accession_number,
            study_description=study_description,
            limit=limit,
            offset=offset,
        )
        return {"count": len(raw), "results": [pacs_service.format_study(s) for s in raw]}
    except Exception as e:
        raise HTTPException(500, f"Error consultando PACS: {e}")


@router.get("/studies/{study_uid}/analyze")
async def analyze_study_from_pacs(
    study_uid: str,
    series_uid: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Download representative slices from PACS, analyze them, and return
    the same format as /analizar-dicom (compatible with frontend).
    """
    try:
        # 1. If no series_uid, pick the series with the most instances
        if not series_uid:
            series_list = await pacs_service.get_study_series(study_uid)
            if not series_list:
                raise HTTPException(404, "No se encontraron series para este estudio")
            # Pick series with max NumberOfSeriesRelatedInstances (tag 00201209)
            best = max(
                series_list,
                key=lambda s: int(pacs_service._val(s.get("00201209"), "0")),
            )
            series_uid = pacs_service._val(best.get("0020000E"))
            if not series_uid:
                raise HTTPException(404, "No se pudo determinar la serie principal")

        # 2. List instances in the chosen series
        instances = await pacs_service.get_series_instances(study_uid, series_uid)
        if not instances:
            raise HTTPException(404, "No se encontraron instancias en la serie")

        n_total = len(instances)

        # 3. Sample equidistant slices if > MAX_SAMPLE_SLICES
        if n_total > MAX_SAMPLE_SLICES:
            step = n_total / MAX_SAMPLE_SLICES
            indices = [int(i * step) for i in range(MAX_SAMPLE_SLICES)]
            sampled = [instances[i] for i in indices]
        else:
            sampled = instances

        # 4. Download each sampled instance
        dicom_bytes_list = []
        for inst in sampled:
            inst_uid = pacs_service._val(inst.get("00080018"))  # SOPInstanceUID
            if not inst_uid:
                continue
            try:
                dcm_bytes = await pacs_service.get_instance_frames(
                    study_uid, series_uid, inst_uid
                )
                dicom_bytes_list.append(dcm_bytes)
            except Exception:
                pass  # Skip failed downloads, analyze what we got

        if not dicom_bytes_list:
            raise HTTPException(502, "No se pudo descargar ninguna instancia DICOM")

        # 5. Run multi-slice analysis
        analisis = analizar_serie(dicom_bytes_list, n_total_instancias=n_total)

        # 6. Build text context
        contexto = construir_contexto_para_claude(analisis)

        # 7. Return same format as /analizar-dicom
        return {
            "analisis": analisis,
            "contexto_texto": contexto,
            "modalidad": analisis["modalidad"],
            "region": analisis["metadata_tecnica"].get("parte_del_cuerpo", ""),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error analizando estudio desde PACS: {e}")


@router.get("/studies/{study_uid}/viewer-url")
async def viewer_url(study_uid: str, current_user=Depends(get_current_user)):
    return {
        "viewer_url": f"{settings.ohif_viewer_url}/viewer?StudyInstanceUIDs={study_uid}",
        "study_instance_uid": study_uid,
    }


@router.get("/studies/{study_uid}")
async def get_study(study_uid: str, current_user=Depends(get_current_user)):
    try:
        metadata = await pacs_service.get_study_metadata(study_uid)
        series = await pacs_service.get_study_series(study_uid)
        return {"metadata": metadata, "series_count": len(series), "series": series}
    except Exception as e:
        raise HTTPException(500, f"Error: {e}")


@router.get("/worklist")
async def worklist(
    modality: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    try:
        items = await pacs_service.get_worklist(modality)
        return {"count": len(items), "results": items}
    except Exception as e:
        raise HTTPException(500, f"Error worklist: {e}")


@router.get("/health")
async def pacs_health():
    try:
        await pacs_service.search_studies(limit=1)
        return {"status": "ok", "pacs_url": settings.pacs_dcm4chee_url}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.post("/analizar-dicom")
async def solo_analizar_dicom(
    dicom_file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Retorna el análisis técnico del DICOM sin generar informe."""
    dicom_bytes = await dicom_file.read()
    analisis = analizar_dicom(dicom_bytes)
    contexto = construir_contexto_para_claude(analisis)
    return {
        "analisis": analisis,
        "contexto_texto": contexto,
        "modalidad": analisis["modalidad"],
        "region": analisis["metadata_tecnica"].get("parte_del_cuerpo", ""),
    }
