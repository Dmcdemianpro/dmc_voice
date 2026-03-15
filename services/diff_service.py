"""
Servicio de diff automático.

Calcula la diferencia entre el texto que generó Claude (original_text)
y el texto que firmó el radiólogo (corrected_text).
Usa difflib de la stdlib — sin dependencias externas.
"""
import difflib
import re
from typing import List, Optional
from schemas.feedback import DiffResult, DiffOperation


# Umbral para promover un par al pool de training_examples (similitud alta = el radiólogo cambió poco)
# diff_score < 20  → ejemplo de alta calidad (Claude acertó bastante)
# diff_score > 70  → el radiólogo reescribió casi todo (ejemplo de bajo valor para few-shot)
HIGH_QUALITY_THRESHOLD = 20.0
LOW_QUALITY_THRESHOLD = 70.0


def compute_diff(original: str, corrected: str) -> DiffResult:
    """
    Calcula el diff carácter a carácter entre dos textos.
    Retorna DiffResult con métricas y operaciones.
    """
    orig_clean = original.strip()
    corr_clean = corrected.strip()

    # SequenceMatcher trabaja sobre caracteres
    matcher = difflib.SequenceMatcher(None, orig_clean, corr_clean, autojunk=False)
    ratio = round(matcher.ratio(), 4)
    diff_score = round((1.0 - ratio) * 100, 2)

    ops: List[DiffOperation] = []
    char_insertions = 0
    char_deletions = 0
    char_unchanged = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            char_unchanged += (i2 - i1)
            ops.append(DiffOperation(op="equal", text=orig_clean[i1:i2]))
        elif tag == "insert":
            char_insertions += (j2 - j1)
            ops.append(DiffOperation(op="insert", text=corr_clean[j1:j2]))
        elif tag == "delete":
            char_deletions += (i2 - i1)
            ops.append(DiffOperation(op="delete", text=orig_clean[i1:i2]))
        elif tag == "replace":
            char_deletions += (i2 - i1)
            char_insertions += (j2 - j1)
            ops.append(DiffOperation(op="replace", old=orig_clean[i1:i2], new=corr_clean[j1:j2]))

    # Resumen legible
    changed_words = _count_changed_words(orig_clean, corr_clean)
    summary = (
        f"{changed_words} palabras cambiadas · "
        f"+{char_insertions} / -{char_deletions} caracteres · "
        f"ratio {ratio}"
    )

    return DiffResult(
        similarity_ratio=ratio,
        diff_score=diff_score,
        char_insertions=char_insertions,
        char_deletions=char_deletions,
        char_unchanged=char_unchanged,
        ops=ops,
        summary=summary,
    )


def _count_changed_words(original: str, corrected: str) -> int:
    """Cuenta cuántas palabras difieren entre los dos textos."""
    orig_words = re.split(r"\s+", original.strip())
    corr_words = re.split(r"\s+", corrected.strip())
    matcher = difflib.SequenceMatcher(None, orig_words, corr_words, autojunk=False)
    changed = sum(
        max(i2 - i1, j2 - j1)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes()
        if tag != "equal"
    )
    return changed


def compute_quality_score(diff_score: float, time_to_sign_seconds: Optional[float]) -> float:
    """
    Calcula un score de calidad 0–1 para el training example.

    - diff_score bajo + tiempo de firma rápido → alta calidad
    - diff_score alto (radiólogo reescribió mucho) → baja calidad para few-shot
    """
    # Componente de similitud: invierte el diff_score (0=idéntico → 1.0)
    similarity_component = max(0.0, 1.0 - (diff_score / 100.0))

    # Componente de velocidad de firma: tiempo < 60s → bonifica
    speed_component = 0.5  # neutral por defecto
    if time_to_sign_seconds is not None:
        if time_to_sign_seconds < 30:
            speed_component = 1.0   # firmó muy rápido = Claude estuvo muy bien
        elif time_to_sign_seconds < 120:
            speed_component = 0.75
        elif time_to_sign_seconds < 300:
            speed_component = 0.5
        else:
            speed_component = 0.25  # tardó mucho = revisión exhaustiva

    quality = round((similarity_component * 0.7) + (speed_component * 0.3), 4)
    return min(1.0, max(0.0, quality))


def should_auto_promote(diff_score: float) -> bool:
    """
    Determina si un correction_pair debe promoverse automáticamente
    a training_examples (sin revisión manual).
    Solo se promueve si el radiólogo cambió poco.
    """
    return diff_score <= HIGH_QUALITY_THRESHOLD
