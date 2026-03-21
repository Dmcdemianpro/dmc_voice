"""
Tests unitarios para el pipeline de 3 pasos de AsistRad v2.
Cubre: classify_finding (conservador), has_extraction_schema, get_category_template,
       validate_report_consistency.
"""
import sys
import os
import unicodedata
import json
import logging

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Suppress logger output during tests
logging.disable(logging.CRITICAL)


# ── Inline copies of pure functions to test ──────────────────────────────────
# (These mirror the functions in services/asistrad_service.py)

CATEGORIES = ["normal", "isquemico", "hemorragico", "traumatico", "indeterminado"]

EXTRACTION_SCHEMAS = {
    "TC": {
        "Cerebro": "schema_exists"
    }
}


def has_extraction_schema(modality: str, region: str) -> bool:
    return modality in EXTRACTION_SCHEMAS and region in EXTRACTION_SCHEMAS[modality]


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def classify_finding(findings: dict) -> str:
    """Clasificación conservadora (v2) — mirrors asistrad_service.py"""
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"

    normalized = _strip_accents(raw.strip().lower())

    # ── Reglas conservadoras de confiabilidad ──
    confianza_global = _strip_accents(str(findings.get("confianza_global", "")).strip().lower())
    confianza_anat = _strip_accents(str(findings.get("confianza_anatomica", "")).strip().lower())

    # Baja confianza global → indeterminado siempre
    if confianza_global == "baja":
        return "indeterminado"

    # Detectar conflicto isquemia/hemorragia en el mismo texto
    has_isq = any(kw in normalized for kw in ("isquem", "hipodens", "infarto"))
    has_hem = any(kw in normalized for kw in ("hemorrag", "hematoma", "sangr", "hiperdens"))
    if has_isq and has_hem:
        return "indeterminado"

    # Hallazgo patológico pero sin localización ni lateralidad → indeterminado
    localizacion = str(findings.get("localizacion", "no descrito")).strip().lower()
    lateralidad = str(findings.get("lateralidad", "no descrito")).strip().lower()
    hallazgo_pato = normalized not in ("normal", "sin hallazgos", "sin alteraciones",
                                        "sin patologia", "indeterminado")
    if hallazgo_pato and localizacion in ("no descrito", "no aplica", "") and lateralidad in ("no descrito", ""):
        if confianza_anat == "baja":
            return "indeterminado"

    # ── Mapeo directo ──
    if normalized in CATEGORIES:
        return normalized

    # ── Mapeo flexible por keywords (sin acentos) ──
    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"
    if any(kw in normalized for kw in ("traumat", "fractura", "contusi")):
        return "traumatico"
    if has_isq:
        return "isquemico"
    if has_hem:
        return "hemorragico"

    return "indeterminado"


CATEGORY_TEMPLATES = {
    "TC": {
        "Cerebro": {
            "normal": "plantilla_normal",
            "isquemico": "plantilla_isquemica",
            "hemorragico": "plantilla_hemorragica",
            "traumatico": "plantilla_traumatica",
            "indeterminado": "plantilla_indeterminada",
        }
    }
}


def get_category_template(modality: str, region: str, category: str) -> str:
    mod_templates = CATEGORY_TEMPLATES.get(modality, {})
    reg_templates = mod_templates.get(region, {})
    template = reg_templates.get(category)
    if template:
        return template
    return reg_templates.get("indeterminado", "")


def validate_report_consistency(report: str, findings: dict, category: str) -> list:
    """Mirrors asistrad_service.py validate_report_consistency."""
    report_lower = _strip_accents(report.lower())
    violations = []

    if category != "hemorragico":
        hemo_terms = ["hematoma", "hemorragia", "sangrado agudo", "sangre aguda"]
        for term in hemo_terms:
            if term in report_lower:
                violations.append(f"Informe menciona '{term}' pero categoría es '{category}'")

    if category != "isquemico":
        isq_terms = ["isquemia", "isquemico", "infarto cerebral", "acv isquemico"]
        for term in isq_terms:
            if term in report_lower:
                violations.append(f"Informe menciona '{term}' pero categoría es '{category}'")

    all_text = json.dumps(findings, ensure_ascii=False).lower()
    metal_terms = ["material metalico", "implante metalico", "metal"]
    for term in metal_terms:
        if term in report_lower and term not in _strip_accents(all_text):
            violations.append(f"Informe menciona '{term}' pero no está en JSON")

    lat = str(findings.get("lateralidad", "")).strip().lower()
    if lat in ("no descrito", ""):
        if "derecho" in report_lower or "izquierdo" in report_lower:
            desc = _strip_accents(str(findings.get("descripcion_hallazgo", "")).lower())
            if category not in ("normal", "indeterminado") and "normal" not in desc:
                violations.append("Informe especifica lateralidad pero JSON indica 'no descrito'")

    efecto = str(findings.get("efecto_masa", "")).strip().lower()
    if efecto == "ausente" and "efecto de masa" in report_lower:
        if "sin efecto de masa" not in report_lower and "no se identifica efecto de masa" not in report_lower:
            violations.append("Informe menciona efecto de masa pero JSON indica 'ausente'")

    return violations


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — Funciones básicas
# ══════════════════════════════════════════════════════════════════════════════

def test_has_extraction_schema():
    """TC Cerebro tiene schema, otras combinaciones no."""
    assert has_extraction_schema("TC", "Cerebro") is True
    assert has_extraction_schema("TC", "Tórax") is False
    assert has_extraction_schema("RX", "Tórax") is False
    assert has_extraction_schema("RM", "Cerebro") is False
    assert has_extraction_schema("ECO", "Abdomen") is False
    print("  PASS: test_has_extraction_schema")


def test_classify_finding_direct_categories():
    """Clasificación directa de categorías conocidas."""
    assert classify_finding({"hallazgo_principal": "normal"}) == "normal"
    assert classify_finding({"hallazgo_principal": "isquemico"}) == "isquemico"
    assert classify_finding({"hallazgo_principal": "hemorragico"}) == "hemorragico"
    assert classify_finding({"hallazgo_principal": "traumatico"}) == "traumatico"
    assert classify_finding({"hallazgo_principal": "indeterminado"}) == "indeterminado"
    print("  PASS: test_classify_finding_direct_categories")


def test_classify_finding_keyword_fallback():
    """Clasificación por keywords cuando no es categoría directa."""
    # Isquémico
    assert classify_finding({"hallazgo_principal": "hipodensidad lenticular"}) == "isquemico"
    assert classify_finding({"hallazgo_principal": "infarto cerebral"}) == "isquemico"
    assert classify_finding({"hallazgo_principal": "lesión isquémica aguda"}) == "isquemico"

    # Hemorrágico
    assert classify_finding({"hallazgo_principal": "hematoma intraparenquimatoso"}) == "hemorragico"
    assert classify_finding({"hallazgo_principal": "sangrado agudo"}) == "hemorragico"
    assert classify_finding({"hallazgo_principal": "hiperdensidad frontal"}) == "hemorragico"
    assert classify_finding({"hallazgo_principal": "hemorragia subaracnoidea"}) == "hemorragico"

    # Traumático
    assert classify_finding({"hallazgo_principal": "fractura de calota"}) == "traumatico"
    assert classify_finding({"hallazgo_principal": "contusión hemorrágica"}) == "traumatico"
    assert classify_finding({"hallazgo_principal": "hallazgos traumáticos"}) == "traumatico"

    # Normal alternativo
    assert classify_finding({"hallazgo_principal": "sin hallazgos"}) == "normal"
    assert classify_finding({"hallazgo_principal": "sin alteraciones"}) == "normal"
    print("  PASS: test_classify_finding_keyword_fallback")


def test_classify_finding_edge_cases():
    """Casos borde: vacío, None, tipos incorrectos."""
    assert classify_finding({}) == "indeterminado"
    assert classify_finding({"hallazgo_principal": ""}) == "indeterminado"
    assert classify_finding({"hallazgo_principal": None}) == "indeterminado"
    assert classify_finding({"hallazgo_principal": 123}) == "indeterminado"
    assert classify_finding({"hallazgo_principal": "algo desconocido"}) == "indeterminado"
    print("  PASS: test_classify_finding_edge_cases")


def test_classify_finding_case_insensitive():
    """La clasificación es case-insensitive."""
    assert classify_finding({"hallazgo_principal": "NORMAL"}) == "normal"
    assert classify_finding({"hallazgo_principal": "Isquemico"}) == "isquemico"
    assert classify_finding({"hallazgo_principal": "HEMORRAGICO"}) == "hemorragico"
    assert classify_finding({"hallazgo_principal": "  Normal  "}) == "normal"
    print("  PASS: test_classify_finding_case_insensitive")


def test_classify_finding_safety_isquemia_not_hemorragia():
    """CRÍTICO: isquemia NUNCA debe clasificarse como hemorrágica."""
    isquemia_cases = [
        "isquemico",
        "hipodensidad parietal derecha",
        "infarto agudo",
        "lesión isquémica lenticular",
    ]
    for case in isquemia_cases:
        result = classify_finding({"hallazgo_principal": case})
        assert result != "hemorragico", f"'{case}' clasificado como hemorragico!"
        assert result == "isquemico", f"'{case}' debería ser isquemico, got '{result}'"
    print("  PASS: test_classify_finding_safety_isquemia_not_hemorragia")


def test_classify_finding_safety_hemorragia_not_isquemia():
    """CRÍTICO: hemorragia NUNCA debe clasificarse como isquémica."""
    hemorragia_cases = [
        "hemorragico",
        "hematoma agudo",
        "sangrado intraparenquimatoso",
        "hiperdensidad lenticular",
    ]
    for case in hemorragia_cases:
        result = classify_finding({"hallazgo_principal": case})
        assert result != "isquemico", f"'{case}' clasificado como isquemico!"
        assert result == "hemorragico", f"'{case}' debería ser hemorragico, got '{result}'"
    print("  PASS: test_classify_finding_safety_hemorragia_not_isquemia")


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — Reglas conservadoras (v2)
# ══════════════════════════════════════════════════════════════════════════════

def test_conservative_low_global_confidence():
    """confianza_global=baja → siempre indeterminado, sin importar hallazgo."""
    assert classify_finding({
        "hallazgo_principal": "isquemico",
        "confianza_global": "baja",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "hemorragico",
        "confianza_global": "baja",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "hipodensidad parietal",
        "confianza_global": "baja",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "hematoma frontal",
        "confianza_global": "baja",
    }) == "indeterminado"

    # Normal con baja confianza también → indeterminado
    assert classify_finding({
        "hallazgo_principal": "normal",
        "confianza_global": "baja",
    }) == "indeterminado"
    print("  PASS: test_conservative_low_global_confidence")


def test_conservative_high_confidence_classifies():
    """confianza_global=alta → clasificación normal."""
    assert classify_finding({
        "hallazgo_principal": "isquemico",
        "confianza_global": "alta",
    }) == "isquemico"

    assert classify_finding({
        "hallazgo_principal": "hemorragico",
        "confianza_global": "alta",
    }) == "hemorragico"

    assert classify_finding({
        "hallazgo_principal": "normal",
        "confianza_global": "alta",
    }) == "normal"
    print("  PASS: test_conservative_high_confidence_classifies")


def test_conservative_medium_confidence_classifies():
    """confianza_global=media → clasificación normal (solo baja bloquea)."""
    assert classify_finding({
        "hallazgo_principal": "isquemico",
        "confianza_global": "media",
    }) == "isquemico"
    print("  PASS: test_conservative_medium_confidence_classifies")


def test_conservative_conflict_isquemia_hemorragia():
    """CRÍTICO: si hallazgo menciona AMBOS isquemia y hemorragia → indeterminado."""
    # Texto con keywords de ambos
    assert classify_finding({
        "hallazgo_principal": "hipodensidad con hemorragia",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "infarto hemorrágico",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "isquemia con sangrado",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "hiperdensidad hipodensa mixta",
    }) == "indeterminado"
    print("  PASS: test_conservative_conflict_isquemia_hemorragia")


def test_conservative_no_location_low_anat_confidence():
    """Hallazgo patológico sin localización y confianza_anatomica=baja → indeterminado."""
    assert classify_finding({
        "hallazgo_principal": "hipodensidad difusa",
        "localizacion": "no descrito",
        "lateralidad": "no descrito",
        "confianza_anatomica": "baja",
    }) == "indeterminado"

    assert classify_finding({
        "hallazgo_principal": "hematoma",
        "localizacion": "no aplica",
        "lateralidad": "no descrito",
        "confianza_anatomica": "baja",
    }) == "indeterminado"
    print("  PASS: test_conservative_no_location_low_anat_confidence")


def test_conservative_no_location_high_anat_confidence():
    """Hallazgo patológico sin localización PERO confianza_anatomica alta → SÍ clasifica."""
    assert classify_finding({
        "hallazgo_principal": "hipodensidad difusa",
        "localizacion": "no descrito",
        "lateralidad": "no descrito",
        "confianza_anatomica": "alta",
    }) == "isquemico"

    assert classify_finding({
        "hallazgo_principal": "hematoma",
        "localizacion": "no descrito",
        "lateralidad": "no descrito",
        "confianza_anatomica": "alta",
    }) == "hemorragico"
    print("  PASS: test_conservative_no_location_high_anat_confidence")


def test_conservative_with_location_classifies():
    """Hallazgo patológico CON localización → clasifica normalmente."""
    assert classify_finding({
        "hallazgo_principal": "hipodensidad focal",
        "localizacion": "lenticular",
        "lateralidad": "derecho",
        "confianza_anatomica": "baja",  # Baja pero hay localización
    }) == "isquemico"
    print("  PASS: test_conservative_with_location_classifies")


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — get_category_template
# ══════════════════════════════════════════════════════════════════════════════

def test_get_category_template():
    """Selección correcta de plantilla por categoría."""
    assert get_category_template("TC", "Cerebro", "normal") == "plantilla_normal"
    assert get_category_template("TC", "Cerebro", "isquemico") == "plantilla_isquemica"
    assert get_category_template("TC", "Cerebro", "hemorragico") == "plantilla_hemorragica"
    assert get_category_template("TC", "Cerebro", "traumatico") == "plantilla_traumatica"
    assert get_category_template("TC", "Cerebro", "indeterminado") == "plantilla_indeterminada"
    print("  PASS: test_get_category_template")


def test_get_category_template_fallback():
    """Categoría desconocida debe caer en indeterminado."""
    assert get_category_template("TC", "Cerebro", "xyz") == "plantilla_indeterminada"
    assert get_category_template("RX", "Tórax", "normal") == ""  # No hay template
    print("  PASS: test_get_category_template_fallback")


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — Pipeline integration
# ══════════════════════════════════════════════════════════════════════════════

def test_pipeline_integration_isquemia():
    """Test integrado: JSON con isquemia y alta confianza → clasificación → plantilla correcta."""
    findings = {
        "hallazgo_principal": "isquemico",
        "descripcion_hallazgo": "Área hipodensa en región lenticular derecha",
        "localizacion": "lenticular",
        "lateralidad": "derecho",
        "densidad": "hipodenso",
        "efecto_masa": "ausente",
        "confianza_global": "alta",
        "confianza_anatomica": "alta",
    }
    category = classify_finding(findings)
    assert category == "isquemico"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_isquemica"
    assert template != "plantilla_hemorragica"
    print("  PASS: test_pipeline_integration_isquemia")


def test_pipeline_integration_hemorragia():
    """Test integrado: JSON con hemorragia y alta confianza → plantilla correcta."""
    findings = {
        "hallazgo_principal": "hemorragico",
        "descripcion_hallazgo": "Hematoma intraparenquimatoso lenticular izquierdo",
        "localizacion": "lenticular",
        "lateralidad": "izquierdo",
        "densidad": "hiperdenso",
        "efecto_masa": "presente",
        "confianza_global": "alta",
        "confianza_anatomica": "alta",
    }
    category = classify_finding(findings)
    assert category == "hemorragico"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_hemorragica"
    assert template != "plantilla_isquemica"
    print("  PASS: test_pipeline_integration_hemorragia")


def test_pipeline_integration_normal():
    """Test integrado: estudio normal → clasificación → plantilla neutra."""
    findings = {
        "hallazgo_principal": "normal",
        "descripcion_hallazgo": "sin hallazgos patológicos",
        "confianza_global": "alta",
    }
    category = classify_finding(findings)
    assert category == "normal"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_normal"
    print("  PASS: test_pipeline_integration_normal")


def test_pipeline_low_confidence_forces_indeterminado():
    """Test integrado: isquemia pero baja confianza → indeterminado → plantilla cautelosa."""
    findings = {
        "hallazgo_principal": "isquemico",
        "localizacion": "lenticular",
        "lateralidad": "derecho",
        "confianza_global": "baja",
    }
    category = classify_finding(findings)
    assert category == "indeterminado"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_indeterminada"
    assert template != "plantilla_isquemica"
    print("  PASS: test_pipeline_low_confidence_forces_indeterminado")


def test_contusion_hemorragica_is_traumatic():
    """Contusión hemorrágica: 'contusi' keyword match antes de 'hemorrag' → traumatico."""
    result = classify_finding({"hallazgo_principal": "contusión hemorrágica"})
    assert result == "traumatico"
    print("  PASS: test_contusion_hemorragica_is_traumatic")


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — validate_report_consistency (Paso 4)
# ══════════════════════════════════════════════════════════════════════════════

def test_validation_clean_report():
    """Informe consistente con JSON → sin violaciones."""
    findings = {
        "hallazgo_principal": "isquemico",
        "localizacion": "lenticular",
        "lateralidad": "derecho",
        "efecto_masa": "ausente",
    }
    report = "Hipodensidad en región lenticular derecha sin efecto de masa."
    violations = validate_report_consistency(report, findings, "isquemico")
    assert violations == [], f"Esperaba 0 violaciones, got: {violations}"
    print("  PASS: test_validation_clean_report")


def test_validation_hemo_terms_in_isquemia():
    """CRÍTICO: informe con 'hematoma' para categoría isquémica → violación."""
    findings = {"hallazgo_principal": "isquemico", "lateralidad": "derecho"}
    report = "Se identifica hematoma en región lenticular derecho."
    violations = validate_report_consistency(report, findings, "isquemico")
    assert len(violations) >= 1
    assert any("hematoma" in v for v in violations)
    print("  PASS: test_validation_hemo_terms_in_isquemia")


def test_validation_isq_terms_in_hemorragia():
    """CRÍTICO: informe con 'isquemia' para categoría hemorrágica → violación."""
    findings = {"hallazgo_principal": "hemorragico", "lateralidad": "izquierdo"}
    report = "Se observa isquemia en territorio silviano izquierdo."
    violations = validate_report_consistency(report, findings, "hemorragico")
    assert len(violations) >= 1
    assert any("isquemia" in v for v in violations)
    print("  PASS: test_validation_isq_terms_in_hemorragia")


def test_validation_invented_metal():
    """Informe menciona material metálico no presente en JSON → violación."""
    findings = {
        "hallazgo_principal": "normal",
        "hallazgos_secundarios": [],
    }
    report = "Se observa material metalico en región frontal. Estudio normal."
    violations = validate_report_consistency(report, findings, "normal")
    assert len(violations) >= 1
    assert any("material metalico" in v for v in violations)
    print("  PASS: test_validation_invented_metal")


def test_validation_invented_laterality():
    """Informe especifica lateralidad que JSON no tiene → violación (para cat patológica)."""
    findings = {
        "hallazgo_principal": "isquemico",
        "lateralidad": "no descrito",
        "descripcion_hallazgo": "hipodensidad focal",
    }
    report = "Hipodensidad focal en lóbulo parietal derecho."
    violations = validate_report_consistency(report, findings, "isquemico")
    assert len(violations) >= 1
    assert any("lateralidad" in v for v in violations)
    print("  PASS: test_validation_invented_laterality")


def test_validation_laterality_ok_for_normal():
    """Lateralidad en informe normal NO es violación (puede describir anatomía)."""
    findings = {
        "hallazgo_principal": "normal",
        "lateralidad": "no descrito",
    }
    report = "Hemisferios cerebrales de densidad simétrica, sin lesiones focales."
    violations = validate_report_consistency(report, findings, "normal")
    lat_violations = [v for v in violations if "lateralidad" in v]
    assert len(lat_violations) == 0
    print("  PASS: test_validation_laterality_ok_for_normal")


def test_validation_efecto_masa_absent():
    """Informe menciona efecto de masa pero JSON dice 'ausente' → violación."""
    findings = {
        "hallazgo_principal": "isquemico",
        "lateralidad": "derecho",
        "efecto_masa": "ausente",
    }
    report = "Hipodensidad parietal derecha con efecto de masa local."
    violations = validate_report_consistency(report, findings, "isquemico")
    assert len(violations) >= 1
    assert any("efecto de masa" in v for v in violations)
    print("  PASS: test_validation_efecto_masa_absent")


def test_validation_sin_efecto_masa_is_ok():
    """'sin efecto de masa' es válido cuando efecto_masa='ausente'."""
    findings = {
        "hallazgo_principal": "isquemico",
        "lateralidad": "derecho",
        "efecto_masa": "ausente",
    }
    report = "Hipodensidad parietal derecha sin efecto de masa."
    violations = validate_report_consistency(report, findings, "isquemico")
    masa_violations = [v for v in violations if "efecto de masa" in v]
    assert len(masa_violations) == 0
    print("  PASS: test_validation_sin_efecto_masa_is_ok")


def test_validation_hemorragia_term_ok_for_hemorragico():
    """'hematoma' en informe hemorrágico NO es violación."""
    findings = {
        "hallazgo_principal": "hemorragico",
        "lateralidad": "izquierdo",
    }
    report = "Hematoma intraparenquimatoso lenticular izquierdo."
    violations = validate_report_consistency(report, findings, "hemorragico")
    hemo_violations = [v for v in violations if "hematoma" in v]
    assert len(hemo_violations) == 0
    print("  PASS: test_validation_hemorragia_term_ok_for_hemorragico")


# ── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        # Básicos
        test_has_extraction_schema,
        test_classify_finding_direct_categories,
        test_classify_finding_keyword_fallback,
        test_classify_finding_edge_cases,
        test_classify_finding_case_insensitive,
        test_classify_finding_safety_isquemia_not_hemorragia,
        test_classify_finding_safety_hemorragia_not_isquemia,
        # Conservadores v2
        test_conservative_low_global_confidence,
        test_conservative_high_confidence_classifies,
        test_conservative_medium_confidence_classifies,
        test_conservative_conflict_isquemia_hemorragia,
        test_conservative_no_location_low_anat_confidence,
        test_conservative_no_location_high_anat_confidence,
        test_conservative_with_location_classifies,
        # Templates
        test_get_category_template,
        test_get_category_template_fallback,
        # Integration
        test_pipeline_integration_isquemia,
        test_pipeline_integration_hemorragia,
        test_pipeline_integration_normal,
        test_pipeline_low_confidence_forces_indeterminado,
        test_contusion_hemorragica_is_traumatic,
        # Validación post-generación
        test_validation_clean_report,
        test_validation_hemo_terms_in_isquemia,
        test_validation_isq_terms_in_hemorragia,
        test_validation_invented_metal,
        test_validation_invented_laterality,
        test_validation_laterality_ok_for_normal,
        test_validation_efecto_masa_absent,
        test_validation_sin_efecto_masa_is_ok,
        test_validation_hemorragia_term_ok_for_hemorragico,
    ]

    passed = 0
    failed = 0
    errors = []

    print(f"\nRunning {len(tests)} tests...\n")
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"  FAIL: {test.__name__}: {e}")
        except Exception as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"  ERROR: {test.__name__}: {e}")

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {len(tests)} total")
    if errors:
        print("\nFailures:")
        for name, msg in errors:
            print(f"  - {name}: {msg}")
    print(f"{'='*50}")

    sys.exit(0 if failed == 0 else 1)
