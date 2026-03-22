"""
Registry de clasificadores por modalidad/región.

Permite registrar clasificadores específicos para cada combinación modalidad/región
y proporciona un fallback genérico para combinaciones sin clasificador propio.

Uso:
    from services.clasificacion_registry import register_classifier, classify_for_modality

    @register_classifier("TC", "Cerebro")
    def classify_tc_cerebro(findings: dict) -> str:
        ...

    categoria = classify_for_modality(findings, "TC", "Cerebro")
"""
import logging
import unicodedata
from typing import Callable, Optional

logger = logging.getLogger(__name__)

_CLASSIFIERS: dict[tuple[str, str], Callable[[dict], str]] = {}


def _strip_accents(s: str) -> str:
    """Remove diacritical marks (á→a, é→e, etc.)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def register_classifier(modality: str, region: str):
    """Decorador para registrar un clasificador por modalidad/región.

    Ejemplo:
        @register_classifier("TC", "Cerebro")
        def classify_tc_cerebro(findings: dict) -> str:
            ...
    """
    def decorator(func: Callable[[dict], str]) -> Callable[[dict], str]:
        _CLASSIFIERS[(modality, region)] = func
        return func
    return decorator


def get_classifier(modality: str, region: str) -> Optional[Callable[[dict], str]]:
    """Retorna el clasificador registrado para la modalidad/región, o None."""
    return _CLASSIFIERS.get((modality, region))


def classify_for_modality(findings: dict, modality: str, region: str) -> str:
    """Clasifica usando el clasificador específico o el genérico.

    Si existe un clasificador registrado para (modality, region), lo usa.
    Si no, usa el fallback genérico.
    """
    classifier = _CLASSIFIERS.get((modality, region))
    if classifier is not None:
        return classifier(findings)
    return _classify_generic(findings)


def _classify_generic(findings: dict) -> str:
    """Fallback genérico: solo distingue normal de indeterminado.

    Para modalidades sin clasificador específico, no intenta
    clasificar hallazgos patológicos en categorías concretas.
    """
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"

    normalized = _strip_accents(raw.strip().lower())

    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"

    return "indeterminado"


def list_registered() -> list[tuple[str, str]]:
    """Lista todas las combinaciones modalidad/región registradas."""
    return list(_CLASSIFIERS.keys())
