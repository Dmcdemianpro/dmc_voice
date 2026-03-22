from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from typing import Optional

from services.pacs_service import pacs_service
from services.dicom_analysis_service import (
    analizar_dicom, analizar_serie,
    construir_contexto_para_claude, construir_contexto_multiserie,
    _is_scout_or_localizer,
)
from services.json_clinico_service import construir_json_clinico
from middleware.auth_middleware import get_current_user
from config import settings

router = APIRouter(prefix="/api/v1/pacs", tags=["PACS"])

MAX_SAMPLE_SLICES = 30


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
    Download representative slices from ALL series in the study,
    analyze each series independently, and return a unified context.
    If series_uid is provided, analyze only that series.
    """
    try:
        # 1. Determine which series to analyze
        if series_uid:
            # Single series requested
            series_to_analyze = [{"uid": series_uid, "desc": "", "n_instances": 0}]
        else:
            # All series in the study
            series_list = await pacs_service.get_study_series(study_uid)
            if not series_list:
                raise HTTPException(404, "No se encontraron series para este estudio")
            series_to_analyze = []
            for s in series_list:
                uid = pacs_service._val(s.get("0020000E"))
                if uid:
                    series_to_analyze.append({
                        "uid": uid,
                        "desc": pacs_service._val(s.get("0008103E"), ""),
                        "n_instances": int(pacs_service._val(s.get("00201209"), "0")),
                    })

        if not series_to_analyze:
            raise HTTPException(404, "No se encontraron series válidas")

        # Filter SCOUT/Localizer series before downloading
        series_filtradas = [
            s for s in series_to_analyze
            if not _is_scout_or_localizer(s["desc"], s["n_instances"])
        ]
        # Fallback: if all are SCOUT, use the one with most slices
        if not series_filtradas and series_to_analyze:
            series_filtradas = [max(series_to_analyze, key=lambda x: x["n_instances"])]
        series_to_analyze = series_filtradas

        # 2. Analyze each series
        resultados_series = []
        total_instancias_estudio = 0
        total_analizadas_estudio = 0

        for serie_info in series_to_analyze:
            s_uid = serie_info["uid"]

            # List instances
            instances = await pacs_service.get_series_instances(study_uid, s_uid)
            if not instances:
                continue

            n_total = len(instances)
            total_instancias_estudio += n_total

            # Sample equidistant slices if > MAX_SAMPLE_SLICES
            if n_total > MAX_SAMPLE_SLICES:
                step = n_total / MAX_SAMPLE_SLICES
                indices = [int(i * step) for i in range(MAX_SAMPLE_SLICES)]
                sampled = [instances[i] for i in indices]
            else:
                sampled = instances

            # Download each sampled instance
            dicom_bytes_list = []
            for inst in sampled:
                inst_uid = pacs_service._val(inst.get("00080018"))
                if not inst_uid:
                    continue
                try:
                    dcm_bytes = await pacs_service.get_instance_frames(
                        study_uid, s_uid, inst_uid
                    )
                    dicom_bytes_list.append(dcm_bytes)
                except Exception:
                    pass

            if not dicom_bytes_list:
                continue

            total_analizadas_estudio += len(dicom_bytes_list)

            # Run analysis for this series
            analisis_serie = analizar_serie(dicom_bytes_list, n_total_instancias=n_total)
            # Override description from series metadata
            if serie_info["desc"]:
                analisis_serie["metadata_tecnica"]["descripcion_serie"] = serie_info["desc"]

            resultados_series.append(analisis_serie)

        if not resultados_series:
            raise HTTPException(502, "No se pudo descargar ninguna instancia DICOM")

        # 3. Build unified context from all series
        contexto = construir_contexto_multiserie(
            resultados_series, total_instancias_estudio, total_analizadas_estudio
        )

        # 4. Use first series for top-level fields (modalidad, region)
        primer = resultados_series[0]

        # 5. Build structured clinical JSON
        json_clinico = construir_json_clinico(primer)

        return {
            "analisis": {
                "modalidad": primer["modalidad"],
                "metadata_tecnica": primer["metadata_tecnica"],
                "analisis_cuantitativo": primer.get("analisis_cuantitativo"),
                "advertencias_tecnicas": primer.get("advertencias_tecnicas", []),
                "n_series_analizadas": len(resultados_series),
                "n_cortes_analizados": total_analizadas_estudio,
                "n_cortes_total": total_instancias_estudio,
                "series_detalle": resultados_series,
            },
            "contexto_texto": contexto,
            "json_clinico": json_clinico,
            "modalidad": primer["modalidad"],
            "region": primer["metadata_tecnica"].get("parte_del_cuerpo", ""),
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
