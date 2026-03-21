"""
Tests unitarios para el pipeline de 3 pasos de AsistRad.
Cubre: classify_finding, has_extraction_schema, get_category_template.
"""
import sys
import os
import unicodedata

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# We can't import the full service due to DB/config dependencies,
# so we extract and test the pure functions directly.
import json


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
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"
    normalized = _strip_accents(raw.strip().lower())
    if normalized in CATEGORIES:
        return normalized
    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"
    if any(kw in normalized for kw in ("traumat", "fractura", "contusi")):
        return "traumatico"
    if any(kw in normalized for kw in ("isquem", "hipodens", "infarto")):
        return "isquemico"
    if any(kw in normalized for kw in ("hemorrag", "hematoma", "sangr", "hiperdens")):
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


# ══════════════════════════════════════════════════════════════════════════════
# TESTS
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
    assert classify_finding({"hallazgo_principal": "contusión hemorrágica"}) == "traumatico"  # traumat keyword primero
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


def test_pipeline_integration_isquemia():
    """Test integrado: JSON con isquemia → clasificación → plantilla correcta."""
    findings = {
        "hallazgo_principal": "isquemico",
        "descripcion_hallazgo": "Área hipodensa en región lenticular derecha",
        "localizacion": "lenticular",
        "lateralidad": "derecho",
        "densidad": "hipodenso",
        "efecto_masa": "ausente",
    }
    category = classify_finding(findings)
    assert category == "isquemico"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_isquemica"
    assert template != "plantilla_hemorragica"
    print("  PASS: test_pipeline_integration_isquemia")


def test_pipeline_integration_hemorragia():
    """Test integrado: JSON con hemorragia → clasificación → plantilla correcta."""
    findings = {
        "hallazgo_principal": "hemorragico",
        "descripcion_hallazgo": "Hematoma intraparenquimatoso lenticular izquierdo",
        "localizacion": "lenticular",
        "lateralidad": "izquierdo",
        "densidad": "hiperdenso",
        "efecto_masa": "presente",
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
    }
    category = classify_finding(findings)
    assert category == "normal"
    template = get_category_template("TC", "Cerebro", category)
    assert template == "plantilla_normal"
    print("  PASS: test_pipeline_integration_normal")


def test_contusion_hemorragica_is_traumatic():
    """Contusión hemorrágica: 'traumat' keyword match primero → traumatico (no hemorragico).
    Esto es correcto porque 'contusi' precede a 'hemorrag' en el check."""
    result = classify_finding({"hallazgo_principal": "contusión hemorrágica"})
    assert result == "traumatico"
    print("  PASS: test_contusion_hemorragica_is_traumatic")


# ── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_has_extraction_schema,
        test_classify_finding_direct_categories,
        test_classify_finding_keyword_fallback,
        test_classify_finding_edge_cases,
        test_classify_finding_case_insensitive,
        test_classify_finding_safety_isquemia_not_hemorragia,
        test_classify_finding_safety_hemorragia_not_isquemia,
        test_get_category_template,
        test_get_category_template_fallback,
        test_pipeline_integration_isquemia,
        test_pipeline_integration_hemorragia,
        test_pipeline_integration_normal,
        test_contusion_hemorragica_is_traumatic,
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
