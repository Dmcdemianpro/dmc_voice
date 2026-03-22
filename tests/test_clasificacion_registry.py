"""
Tests unitarios para el registry de clasificadores y los módulos modulares
(schemas_extraccion, plantillas_categoria, clasificadores).
"""
import sys
import os
import logging

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Suppress logger output during tests
logging.disable(logging.CRITICAL)

from services.clasificacion_registry import (
    classify_for_modality,
    get_classifier,
    list_registered,
    _classify_generic,
    register_classifier,
    _CLASSIFIERS,
)
from services.schemas_extraccion import (
    EXTRACTION_SCHEMAS,
    has_extraction_schema,
    get_extraction_schema,
    GENERIC_EXTRACTION_SCHEMA,
)
from services.plantillas_categoria import (
    CATEGORY_TEMPLATES,
    get_category_template,
)
# Trigger auto-registration
import services.clasificadores  # noqa: F401


# ══════════════════════════════════════════════════════════════════════════════
# TESTS — Registry
# ══════════════════════════════════════════════════════════════════════════════

def test_register_and_retrieve():
    """El clasificador TC/Cerebro se registra y se puede recuperar."""
    classifier = get_classifier("TC", "Cerebro")
    assert classifier is not None, "TC/Cerebro classifier not registered"
    assert ("TC", "Cerebro") in list_registered()
    print("  PASS: test_register_and_retrieve")


def test_classify_tc_cerebro_via_registry():
    """classify_for_modality para TC/Cerebro da el mismo resultado que classify_finding."""
    # Normal
    assert classify_for_modality({"hallazgo_principal": "normal"}, "TC", "Cerebro") == "normal"
    # Isquémico
    assert classify_for_modality({"hallazgo_principal": "isquemico"}, "TC", "Cerebro") == "isquemico"
    # Hemorrágico
    assert classify_for_modality({"hallazgo_principal": "hemorragico"}, "TC", "Cerebro") == "hemorragico"
    # Traumático
    assert classify_for_modality({"hallazgo_principal": "traumatico"}, "TC", "Cerebro") == "traumatico"
    # Baja confianza → indeterminado
    assert classify_for_modality({
        "hallazgo_principal": "isquemico",
        "confianza_global": "baja",
    }, "TC", "Cerebro") == "indeterminado"
    # Contusión hemorrágica → traumático (keyword order)
    assert classify_for_modality({
        "hallazgo_principal": "contusión hemorrágica",
    }, "TC", "Cerebro") == "traumatico"
    print("  PASS: test_classify_tc_cerebro_via_registry")


def test_generic_fallback():
    """Modalidad sin clasificador registrado usa fallback genérico."""
    # Normal → normal
    assert classify_for_modality({"hallazgo_principal": "normal"}, "RX", "Tórax") == "normal"
    assert classify_for_modality({"hallazgo_principal": "sin hallazgos"}, "RX", "Tórax") == "normal"
    # Patológico → indeterminado (genérico no clasifica)
    assert classify_for_modality({"hallazgo_principal": "fractura"}, "RX", "Tórax") == "indeterminado"
    assert classify_for_modality({"hallazgo_principal": "hematoma"}, "ECO", "Abdomen") == "indeterminado"
    print("  PASS: test_generic_fallback")


def test_schemas_dict_intact():
    """EXTRACTION_SCHEMAS tiene TC/Cerebro con schema no vacío."""
    assert "TC" in EXTRACTION_SCHEMAS
    assert "Cerebro" in EXTRACTION_SCHEMAS["TC"]
    schema = EXTRACTION_SCHEMAS["TC"]["Cerebro"]
    assert len(schema) > 100
    assert "hallazgo_principal" in schema
    assert "confianza_global" in schema
    print("  PASS: test_schemas_dict_intact")


def test_templates_dict_intact():
    """CATEGORY_TEMPLATES tiene TC/Cerebro con todas las categorías."""
    assert "TC" in CATEGORY_TEMPLATES
    assert "Cerebro" in CATEGORY_TEMPLATES["TC"]
    templates = CATEGORY_TEMPLATES["TC"]["Cerebro"]
    for cat in ("normal", "isquemico", "hemorragico", "traumatico", "indeterminado", "_limitado"):
        assert cat in templates, f"Missing template for {cat}"
        assert len(templates[cat]) > 50, f"Template {cat} too short"
    print("  PASS: test_templates_dict_intact")


def test_has_extraction_schema_backward():
    """has_extraction_schema() sigue funcionando igual que antes."""
    assert has_extraction_schema("TC", "Cerebro") is True
    assert has_extraction_schema("TC", "Tórax") is False
    assert has_extraction_schema("RX", "Tórax") is False
    assert has_extraction_schema("RM", "Cerebro") is False
    print("  PASS: test_has_extraction_schema_backward")


def test_new_modality_stub():
    """Registrar un stub de nueva modalidad → recuperable via registry."""
    # Register a test stub
    @register_classifier("TEST_MOD", "TEST_REG")
    def _test_classifier(findings: dict) -> str:
        return "test_result"

    assert get_classifier("TEST_MOD", "TEST_REG") is not None
    assert classify_for_modality({}, "TEST_MOD", "TEST_REG") == "test_result"

    # Cleanup
    del _CLASSIFIERS[("TEST_MOD", "TEST_REG")]
    print("  PASS: test_new_modality_stub")


def test_get_category_template_modular():
    """get_category_template modular funciona correctamente."""
    assert "Hallazgos" in get_category_template("TC", "Cerebro", "normal")
    assert "Hallazgos" in get_category_template("TC", "Cerebro", "hemorragico")
    # Fallback a indeterminado
    assert "Hallazgos" in get_category_template("TC", "Cerebro", "xyz_desconocido")
    # Modalidad inexistente
    assert get_category_template("XYZ", "Nada", "normal") == ""
    print("  PASS: test_get_category_template_modular")


# ── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_register_and_retrieve,
        test_classify_tc_cerebro_via_registry,
        test_generic_fallback,
        test_schemas_dict_intact,
        test_templates_dict_intact,
        test_has_extraction_schema_backward,
        test_new_modality_stub,
        test_get_category_template_modular,
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
