"""
Servicio de JSON clínico estructurado.

Construye un JSON clínico normalizado a partir del análisis densitométrico
y anatómico de una serie DICOM. Este JSON enriquece el contexto que recibe Claude
en el paso de extracción.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def construir_json_clinico(analisis_serie: dict) -> dict:
    """Construye JSON clínico estructurado desde análisis densitométrico + anatómico.

    Args:
        analisis_serie: resultado de analizar_serie() o analizar_dicom(),
                        opcionalmente con campo "analisis_anatomico".

    Returns:
        dict con JSON clínico estructurado.
    """
    meta = analisis_serie.get("metadata_tecnica", {})
    cuant = analisis_serie.get("analisis_cuantitativo")
    anat = analisis_serie.get("analisis_anatomico")
    modalidad = analisis_serie.get("modalidad", "")

    # Normalizar modalidad
    mod_norm = _normalizar_modalidad(modalidad)

    # Determinar región
    region = _determinar_region(meta)

    # Construir sección de serie prioritaria
    serie_prioritaria = _construir_info_serie(meta, analisis_serie)

    # Construir hallazgos anatómicos
    hallazgos_anatomicos = _construir_hallazgos_anatomicos(anat)

    # Extraer asimetrías y focos
    asimetrias = anat.get("asimetrias", []) if anat else []
    focos = anat.get("focos_atenuacion", []) if anat else []

    # Confianza
    confianza_anatomica = anat.get("confianza_anatomica", "no evaluable") if anat else "no evaluable"
    confianza_serie = _evaluar_confianza_serie_simple(analisis_serie)
    confianza_global = _calcular_confianza_global(confianza_anatomica, confianza_serie)

    # Limitaciones
    limitaciones = _merge_limitaciones(analisis_serie, anat)

    # Series fuente
    series_fuente = _construir_series_fuente(analisis_serie)

    return {
        "modalidad": mod_norm,
        "region": region,
        "descripcion_estudio": meta.get("descripcion_estudio", "No especificado"),
        "serie_prioritaria": serie_prioritaria,
        "hallazgos_anatomicos": hallazgos_anatomicos,
        "asimetrias": asimetrias,
        "focos_atenuacion": focos,
        "confianza_anatomica": confianza_anatomica,
        "confianza_global": confianza_global,
        "limitaciones": limitaciones,
        "series_fuente": series_fuente,
    }


def _normalizar_modalidad(modalidad: str) -> str:
    """Normaliza el código de modalidad DICOM a nombre legible."""
    mapping = {
        "CT": "TC", "TC": "TC",
        "MR": "RM", "RM": "RM",
        "US": "ECO", "ECO": "ECO",
        "DX": "RX", "CR": "RX", "RX": "RX",
    }
    return mapping.get(modalidad.upper(), modalidad.upper())


def _determinar_region(meta: dict) -> str:
    """Determina la región anatómica del estudio."""
    parte = str(meta.get("parte_del_cuerpo", "")).strip()
    desc_estudio = str(meta.get("descripcion_estudio", "")).strip().lower()
    desc_serie = str(meta.get("descripcion_serie", "")).strip().lower()

    brain_patterns = ("head", "brain", "cerebr", "encef", "craneal", "craneo", "cabeza")
    for field in (parte.lower(), desc_estudio, desc_serie):
        if any(p in field for p in brain_patterns):
            return "Cerebro"

    if parte and parte != "No especificado":
        return parte

    return "No especificada"


def _construir_info_serie(meta: dict, analisis: dict) -> dict:
    """Construye info de la serie prioritaria."""
    grosor_raw = meta.get("grosor_corte_mm", "No especificado")
    try:
        grosor = float(grosor_raw)
    except (ValueError, TypeError):
        grosor = None

    n_analizados = analisis.get("n_cortes_analizados", 0)
    n_total = analisis.get("n_cortes_total", 0)

    confianza = "alta" if n_analizados >= 20 else ("media" if n_analizados >= 10 else "baja")

    return {
        "descripcion": meta.get("descripcion_serie", "No descrita"),
        "grosor_mm": grosor,
        "confianza": confianza,
    }


def _construir_hallazgos_anatomicos(anat: Optional[dict]) -> dict:
    """Construye sección de hallazgos anatómicos."""
    if not anat:
        return {
            "sistema_ventricular": "no evaluable",
            "linea_media": "no evaluable",
            "calota": "no evaluable",
            "fosa_posterior": "no evaluable",
            "parenquima_supratentorial": "no evaluable",
        }

    sv = anat.get("sistema_ventricular", {})
    lm = anat.get("linea_media", {})
    calota = anat.get("calota", {})
    fp = anat.get("fosa_posterior", {})
    paren = anat.get("parenquima_supratentorial", {})

    # Formatear línea media con desviación si aplica
    estado_lm = lm.get("estado", "no evaluable")
    if estado_lm in ("desviada_derecha", "desviada_izquierda"):
        lm_str = f"{estado_lm} ({lm.get('desviacion_mm', 0)} mm)"
    else:
        lm_str = estado_lm

    return {
        "sistema_ventricular": sv.get("estado", "no evaluable"),
        "linea_media": lm_str,
        "calota": calota.get("estado", "no evaluable"),
        "fosa_posterior": fp.get("descripcion", "no evaluable"),
        "parenquima_supratentorial": paren.get("descripcion", "no evaluable"),
    }


def _evaluar_confianza_serie_simple(analisis: dict) -> str:
    """Confianza basada en cantidad de cortes analizados."""
    n = analisis.get("n_cortes_analizados", 0)
    if n >= 20:
        return "alta"
    elif n >= 10:
        return "media"
    return "baja"


def _calcular_confianza_global(confianza_anatomica: str, confianza_serie: str) -> str:
    """Confianza global = mínima entre anatómica y serie."""
    niveles = {"alta": 2, "media": 1, "baja": 0, "no evaluable": 0}
    inverso = {2: "alta", 1: "media", 0: "baja"}
    min_nivel = min(niveles.get(confianza_anatomica, 0), niveles.get(confianza_serie, 0))
    return inverso[min_nivel]


def _merge_limitaciones(analisis: dict, anat: Optional[dict]) -> list[str]:
    """Combina limitaciones de análisis cuantitativo y anatómico."""
    limitaciones = []

    # Limitaciones del análisis cuantitativo
    advs = analisis.get("advertencias_tecnicas", [])
    limitaciones.extend(advs)

    # Limitaciones del análisis anatómico
    if anat:
        for lim in anat.get("limitaciones", []):
            if lim not in limitaciones:
                limitaciones.append(lim)
    else:
        limitaciones.append("Análisis anatómico no disponible para esta modalidad/región")

    return limitaciones


def _construir_series_fuente(analisis: dict) -> list[dict]:
    """Construye lista de series fuente."""
    meta = analisis.get("metadata_tecnica", {})
    return [{
        "descripcion": meta.get("descripcion_serie", "No descrita"),
        "n_cortes_analizados": analisis.get("n_cortes_analizados", 0),
        "n_cortes_total": analisis.get("n_cortes_total", 0),
    }]
