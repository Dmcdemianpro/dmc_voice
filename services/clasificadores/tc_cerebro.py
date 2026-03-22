"""
Clasificador TC Cerebro — extraído de asistrad_service.py.

Registra automáticamente el clasificador al importarse.
"""
import logging
import unicodedata
from services.clasificacion_registry import register_classifier

logger = logging.getLogger(__name__)

CATEGORIES = ["normal", "isquemico", "hemorragico", "traumatico", "indeterminado"]


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


@register_classifier("TC", "Cerebro")
def classify_tc_cerebro(findings: dict) -> str:
    """Clasificación conservadora para TC Cerebro.

    Reglas de prudencia:
    - confianza_global baja -> indeterminado
    - confianza_anatomica baja sin hallazgo claro -> indeterminado
    - Conflicto isquemia/hemorragia -> indeterminado
    - Falta localización + lateralidad pero hay hallazgo sugerente -> indeterminado
    """
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"

    normalized = _strip_accents(raw.strip().lower())

    # -- Reglas conservadoras de confiabilidad --
    confianza_global = _strip_accents(str(findings.get("confianza_global", "")).strip().lower())
    confianza_anat = _strip_accents(str(findings.get("confianza_anatomica", "")).strip().lower())

    # Baja confianza global -> indeterminado siempre
    if confianza_global == "baja":
        logger.info("Clasificacion -> indeterminado (confianza_global=baja)")
        return "indeterminado"

    # Conflicto entre fuentes -> indeterminado
    conflicto = str(findings.get("conflicto_entre_fuentes", "sin conflicto")).strip().lower()
    if conflicto and conflicto not in ("sin conflicto", "no", "ninguno", ""):
        logger.info("Clasificacion -> indeterminado (conflicto entre fuentes: %s)", conflicto)
        return "indeterminado"

    # Detectar conflicto isquemia/hemorragia en el mismo texto
    has_isq = any(kw in normalized for kw in ("isquem", "hipodens", "infarto"))
    has_hem = any(kw in normalized for kw in ("hemorrag", "hematoma", "sangr", "hiperdens"))
    if has_isq and has_hem:
        logger.info("Clasificacion -> indeterminado (conflicto isquemia+hemorragia)")
        return "indeterminado"

    # Hallazgo patológico pero sin localización ni lateralidad -> indeterminado
    localizacion = str(findings.get("localizacion", "no descrito")).strip().lower()
    lateralidad = str(findings.get("lateralidad", "no descrito")).strip().lower()
    hallazgo_pato = normalized not in ("normal", "sin hallazgos", "sin alteraciones",
                                        "sin patologia", "indeterminado")
    if hallazgo_pato and localizacion in ("no descrito", "no aplica", "") and lateralidad in ("no descrito", ""):
        if confianza_anat == "baja":
            logger.info("Clasificacion -> indeterminado (patologico sin localizacion, confianza_anatomica=baja)")
            return "indeterminado"

    # -- Mapeo directo --
    if normalized in CATEGORIES:
        return normalized

    # -- Mapeo flexible por keywords (sin acentos) --
    # Orden importa: traumático antes de hemorrágico (contusión hemorrágica = trauma)
    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"
    if any(kw in normalized for kw in ("traumat", "fractura", "contusi")):
        return "traumatico"
    if has_isq:
        return "isquemico"
    if has_hem:
        return "hemorragico"

    return "indeterminado"
