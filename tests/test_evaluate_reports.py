"""
Tests unitarios para el evaluador de informes (scripts/evaluate_reports.py).
"""
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
logging.disable(logging.CRITICAL)

from scripts.evaluate_reports import (
    evaluar_caso,
    _clasificar_errores,
    _son_sinonimos,
    _contiene_termino,
    _detectar_sobreinterpretaciones,
    calcular_metricas_agregadas,
)


# ── Helpers ──

def _ref_base(**kwargs):
    """Referencia base hemorrágica."""
    base = {
        "informe_texto": "Hematoma intraparenquimatoso lenticular izquierdo.",
        "categoria": "hemorragico",
        "hallazgo_principal": "hematoma intraparenquimatoso",
        "localizacion": "lenticular",
        "lateralidad": "izquierdo",
        "negativos_importantes": ["sin extension intraventricular"],
        "hallazgos_secundarios": ["desviacion linea media 3mm"],
    }
    base.update(kwargs)
    return base


def _pipe_base(**kwargs):
    """Pipeline output base hemorrágico."""
    base = {
        "informe_texto": "Hematoma intraparenquimatoso lenticular izquierdo. Sin extension intraventricular. Desviacion linea media 3mm.",
        "findings_json": {
            "hallazgo_principal": "hemorragico",
            "descripcion_hallazgo": "Hematoma intraparenquimatoso lenticular izquierdo",
            "localizacion": "lenticular",
            "lateralidad": "izquierdo",
        },
        "categoria": "hemorragico",
    }
    base.update(kwargs)
    return base


# ══════════════════════════════════════════════════════════════════════════════
# 1-2. Concordancia categoría match/mismatch
# ══════════════════════════════════════════════════════════════════════════════

def test_categoria_match():
    """Categoría correcta → campo True."""
    ev = evaluar_caso(_ref_base(), _pipe_base())
    assert ev["categoria_correcta"] is True
    print("  PASS: test_categoria_match")


def test_categoria_mismatch():
    """Categoría incorrecta → campo False, error mayor."""
    ev = evaluar_caso(
        _ref_base(),
        _pipe_base(categoria="isquemico"),
    )
    assert ev["categoria_correcta"] is False
    assert len(ev["errores_mayores"]) >= 1
    assert any("incorrecta" in e.lower() for e in ev["errores_mayores"])
    print("  PASS: test_categoria_mismatch")


# ══════════════════════════════════════════════════════════════════════════════
# 3-4. Lateralidad match/mismatch
# ══════════════════════════════════════════════════════════════════════════════

def test_lateralidad_match():
    """Lateralidad correcta."""
    ev = evaluar_caso(_ref_base(), _pipe_base())
    assert ev["lateralidad_correcta"] is True
    print("  PASS: test_lateralidad_match")


def test_lateralidad_mismatch():
    """Lateralidad incorrecta → error mayor."""
    pipe = _pipe_base()
    pipe["findings_json"]["lateralidad"] = "derecho"
    ev = evaluar_caso(_ref_base(), pipe)
    assert ev["lateralidad_correcta"] is False
    assert any("lateralidad" in e.lower() for e in ev["errores_mayores"])
    print("  PASS: test_lateralidad_mismatch")


# ══════════════════════════════════════════════════════════════════════════════
# 5. Cobertura negativos
# ══════════════════════════════════════════════════════════════════════════════

def test_cobertura_negativos():
    """Negativos cubiertos y omitidos se registran correctamente."""
    ev = evaluar_caso(_ref_base(), _pipe_base())
    assert "sin extension intraventricular" in ev["negativos_cubiertos"]
    assert len(ev["negativos_omitidos"]) == 0
    assert ev["cobertura_negativos"] == 1.0

    # Caso con negativo omitido
    pipe_sin_neg = _pipe_base(
        informe_texto="Hematoma intraparenquimatoso lenticular izquierdo. Desviacion linea media."
    )
    ev2 = evaluar_caso(_ref_base(), pipe_sin_neg)
    assert "sin extension intraventricular" in ev2["negativos_omitidos"]
    assert ev2["cobertura_negativos"] < 1.0
    print("  PASS: test_cobertura_negativos")


# ══════════════════════════════════════════════════════════════════════════════
# 6. Detección omisión
# ══════════════════════════════════════════════════════════════════════════════

def test_deteccion_omision():
    """Hallazgo principal no mencionado → error mayor."""
    pipe = _pipe_base(informe_texto="Estudio sin alteraciones agudas.")
    ev = evaluar_caso(_ref_base(), pipe)
    assert any("omision" in e.lower() or "omisión" in e.lower() for e in ev["errores_mayores"])
    print("  PASS: test_deteccion_omision")


# ══════════════════════════════════════════════════════════════════════════════
# 7. Detección sobreinterpretación
# ══════════════════════════════════════════════════════════════════════════════

def test_deteccion_sobreinterpretacion():
    """Pipeline menciona hallazgo patológico no presente en referencia."""
    ref = _ref_base(
        informe_texto="Estudio normal sin hallazgos.",
        categoria="normal",
        hallazgo_principal="normal",
    )
    pipe = _pipe_base(
        informe_texto="Se identifica hidrocefalia comunicante.",
        categoria="normal",
    )
    ev = evaluar_caso(ref, pipe)
    assert len(ev["sobreinterpretaciones"]) >= 1
    assert any("hidrocefalia" in s for s in ev["sobreinterpretaciones"])
    print("  PASS: test_deteccion_sobreinterpretacion")


# ══════════════════════════════════════════════════════════════════════════════
# 8. Clasificación error mayor vs menor
# ══════════════════════════════════════════════════════════════════════════════

def test_clasificacion_errores():
    """Categoría incorrecta = mayor, secundario omitido = menor."""
    pipe = _pipe_base(
        categoria="isquemico",
        informe_texto="Hematoma intraparenquimatoso lenticular izquierdo. Sin extension intraventricular.",
    )
    ev = evaluar_caso(_ref_base(), pipe)
    # Categoría incorrecta → error mayor
    assert len(ev["errores_mayores"]) >= 1
    # Secundario omitido → error menor
    assert len(ev["errores_menores"]) >= 1
    print("  PASS: test_clasificacion_errores")


# ══════════════════════════════════════════════════════════════════════════════
# 9. Métricas agregadas
# ══════════════════════════════════════════════════════════════════════════════

def test_metricas_agregadas():
    """Métricas agregadas calculan correctamente."""
    ev1 = evaluar_caso(_ref_base(), _pipe_base())  # Perfecto
    ev2 = evaluar_caso(_ref_base(), _pipe_base(categoria="isquemico"))  # Cat incorrecta

    metricas = calcular_metricas_agregadas([ev1, ev2])
    assert metricas["n_casos"] == 2
    assert metricas["accuracy_categoria"] == 0.5
    assert metricas["score_medio"] > 0
    assert metricas["score_min"] <= metricas["score_max"]
    print("  PASS: test_metricas_agregadas")


# ══════════════════════════════════════════════════════════════════════════════
# 10. Matching sinónimos
# ══════════════════════════════════════════════════════════════════════════════

def test_matching_sinonimos():
    """Sinónimos clínicos se reconocen correctamente."""
    assert _son_sinonimos("hematoma", "hemorragia intraparenquimatosa") is True
    assert _son_sinonimos("hematoma", "sangrado agudo") is True
    assert _son_sinonimos("hipodensidad", "baja atenuacion") is True
    assert _son_sinonimos("infarto", "isquemia") is True
    assert _son_sinonimos("hematoma", "isquemia") is False
    assert _son_sinonimos("fractura", "hemorragia") is False

    # contiene_termino con sinónimos
    assert _contiene_termino("se observa sangrado agudo lenticular", "hematoma") is True
    assert _contiene_termino("area hipodensa frontal derecha", "hipodensidad") is True
    assert _contiene_termino("estudio normal", "hematoma") is False
    print("  PASS: test_matching_sinonimos")


# ── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_categoria_match,
        test_categoria_mismatch,
        test_lateralidad_match,
        test_lateralidad_mismatch,
        test_cobertura_negativos,
        test_deteccion_omision,
        test_deteccion_sobreinterpretacion,
        test_clasificacion_errores,
        test_metricas_agregadas,
        test_matching_sinonimos,
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
