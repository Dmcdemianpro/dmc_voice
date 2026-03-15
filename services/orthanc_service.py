"""
orthanc_service.py
──────────────────
Cliente async para Orthanc PACS REST API.
Permite consultar si un estudio tiene imágenes disponibles por AccessionNumber.

Documentación Orthanc REST API: https://orthanc.uclouvain.be/api/

Configurar en .env:
    ORTHANC_URL=http://IP-PACS:8042
    ORTHANC_USER=orthanc
    ORTHANC_PASSWORD=orthanc
"""

from typing import Optional
import httpx
from config import settings


def _auth() -> Optional[httpx.BasicAuth]:
    """Retorna credenciales básicas si están configuradas."""
    if settings.orthanc_user and settings.orthanc_password:
        return httpx.BasicAuth(settings.orthanc_user, settings.orthanc_password)
    return None


async def study_has_images(accession_number: str) -> bool:
    """
    Consulta Orthanc para verificar si existe un estudio con el AccessionNumber dado.
    Retorna True si hay imágenes disponibles, False si no hay o Orthanc no está configurado.
    """
    if not settings.orthanc_url:
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
            # Buscar por AccessionNumber usando el endpoint de búsqueda de Orthanc
            response = await client.post(
                f"{settings.orthanc_url}/tools/find",
                json={
                    "Level": "Study",
                    "Query": {"AccessionNumber": accession_number},
                },
                auth=_auth(),
            )
            if response.status_code == 200:
                studies = response.json()
                return len(studies) > 0
    except Exception:
        # Si Orthanc no está disponible, no bloqueamos el flujo
        pass

    return False


async def get_study_info(accession_number: str) -> Optional[dict]:
    """
    Retorna metadata del primer estudio que coincida con el AccessionNumber.
    Útil para enriquecer datos del worklist (fecha, modalidad, número de series).
    Retorna None si no se encuentra o Orthanc no está configurado.
    """
    if not settings.orthanc_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
            # Buscar el estudio
            find_resp = await client.post(
                f"{settings.orthanc_url}/tools/find",
                json={
                    "Level": "Study",
                    "Query": {"AccessionNumber": accession_number},
                    "Expand": True,
                },
                auth=_auth(),
            )
            if find_resp.status_code != 200:
                return None

            studies = find_resp.json()
            if not studies:
                return None

            study = studies[0]
            main_tags = study.get("MainDicomTags", {})

            return {
                "orthanc_id": study.get("ID"),
                "accession_number": main_tags.get("AccessionNumber"),
                "study_date": main_tags.get("StudyDate"),
                "study_description": main_tags.get("StudyDescription"),
                "modalities": study.get("ModalitiesInStudy", []),
                "series_count": len(study.get("Series", [])),
            }
    except Exception:
        pass

    return None


async def get_study_url(accession_number: str) -> Optional[str]:
    """
    Retorna la URL del visor OHIF/Orthanc Stone para el estudio dado.
    Útil para incluir un enlace directo en el informe o en el worklist.
    """
    if not settings.orthanc_url:
        return None

    info = await get_study_info(accession_number)
    if not info or not info.get("orthanc_id"):
        return None

    return f"{settings.orthanc_url}/ohif/viewer?StudyInstanceUIDs={info['orthanc_id']}"
