"""
Tests unitarios para el servicio de JSON clínico estructurado.
"""
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
logging.disable(logging.CRITICAL)

from services.json_clinico_service import construir_json_clinico


# ── Helpers ──

def _analisis_con_anatomia():
    """Análisis de serie con anatomía completa."""
    return {
        "modalidad": "CT",
        "metadata_tecnica": {
            "modalidad": "CT",
            "descripcion_estudio": "TC Cerebro sin contraste",
            "descripcion_serie": "Axial Brain 5.0mm",
            "parte_del_cuerpo": "HEAD",
            "grosor_corte_mm": "5.0",
            "fabricante": "SIEMENS",
            "modelo_equipo": "SOMATOM",
            "institucion": "DMC",
        },
        "analisis_cuantitativo": {
            "tipo": "TC_Hounsfield",
            "distribucion_atenuacion": {},
            "observaciones": [],
        },
        "advertencias_tecnicas": [],
        "n_cortes_analizados": 30,
        "n_cortes_total": 53,
        "analisis_anatomico": {
            "sistema_ventricular": {"estado": "normal", "confianza": 0.7},
            "linea_media": {"estado": "centrada", "desviacion_mm": 0.5},
            "calota": {"estado": "integra"},
            "fosa_posterior": {"descripcion": "sin hallazgos relevantes"},
            "parenquima_supratentorial": {"descripcion": "densidad conservada", "hu_media": 32.0},
            "asimetrias": [],
            "focos_atenuacion": [
                {"tipo": "alta_atenuacion", "lateralidad": "izquierdo", "region": "supratentorial", "posicion": "corte 10/30"},
            ],
            "confianza_anatomica": "alta",
            "limitaciones": ["Análisis aproximado por heurísticas."],
            "slices_evaluables": 28,
        },
    }


def _analisis_sin_anatomia():
    """Análisis de serie sin anatomía (modalidad no TC cerebro)."""
    return {
        "modalidad": "DX",
        "metadata_tecnica": {
            "modalidad": "DX",
            "descripcion_estudio": "RX Tórax PA",
            "descripcion_serie": "Frontal",
            "parte_del_cuerpo": "CHEST",
            "grosor_corte_mm": "No especificado",
            "fabricante": "FUJI",
            "modelo_equipo": "FDR",
            "institucion": "DMC",
        },
        "analisis_cuantitativo": None,
        "advertencias_tecnicas": [],
        "n_cortes_analizados": 1,
        "n_cortes_total": 1,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 1. JSON con anatomía completa → todos los campos poblados
# ══════════════════════════════════════════════════════════════════════════════

def test_json_con_anatomia_completa():
    """Con anatomía → todos los campos del JSON clínico poblados."""
    jc = construir_json_clinico(_analisis_con_anatomia())
    assert jc["modalidad"] == "TC"
    assert jc["region"] == "Cerebro"
    assert jc["hallazgos_anatomicos"]["sistema_ventricular"] == "normal"
    assert jc["hallazgos_anatomicos"]["linea_media"] == "centrada"
    assert jc["hallazgos_anatomicos"]["calota"] == "integra"
    assert jc["hallazgos_anatomicos"]["fosa_posterior"] == "sin hallazgos relevantes"
    assert jc["hallazgos_anatomicos"]["parenquima_supratentorial"] == "densidad conservada"
    assert len(jc["focos_atenuacion"]) == 1
    assert jc["confianza_anatomica"] == "alta"
    print("  PASS: test_json_con_anatomia_completa")


# ══════════════════════════════════════════════════════════════════════════════
# 2. JSON sin anatomía → todos "no evaluable"
# ══════════════════════════════════════════════════════════════════════════════

def test_json_sin_anatomia():
    """Sin anatomía → campos anatómicos 'no evaluable'."""
    jc = construir_json_clinico(_analisis_sin_anatomia())
    assert jc["modalidad"] == "RX"
    assert jc["hallazgos_anatomicos"]["sistema_ventricular"] == "no evaluable"
    assert jc["hallazgos_anatomicos"]["linea_media"] == "no evaluable"
    assert jc["hallazgos_anatomicos"]["calota"] == "no evaluable"
    assert jc["confianza_anatomica"] == "no evaluable"
    print("  PASS: test_json_sin_anatomia")


# ══════════════════════════════════════════════════════════════════════════════
# 3. Todos los campos requeridos presentes
# ══════════════════════════════════════════════════════════════════════════════

def test_campos_requeridos():
    """JSON clínico tiene todos los campos requeridos."""
    required_keys = {
        "modalidad", "region", "descripcion_estudio", "serie_prioritaria",
        "hallazgos_anatomicos", "asimetrias", "focos_atenuacion",
        "confianza_anatomica", "confianza_global", "limitaciones", "series_fuente",
    }
    jc = construir_json_clinico(_analisis_con_anatomia())
    assert required_keys.issubset(set(jc.keys())), f"Missing keys: {required_keys - set(jc.keys())}"

    anat_keys = {"sistema_ventricular", "linea_media", "calota", "fosa_posterior", "parenquima_supratentorial"}
    assert anat_keys.issubset(set(jc["hallazgos_anatomicos"].keys()))

    serie_keys = {"descripcion", "grosor_mm", "confianza"}
    assert serie_keys.issubset(set(jc["serie_prioritaria"].keys()))
    print("  PASS: test_campos_requeridos")


# ══════════════════════════════════════════════════════════════════════════════
# 4. Confianza global = min(anatómica, serie)
# ══════════════════════════════════════════════════════════════════════════════

def test_confianza_global_minima():
    """Confianza global es el mínimo entre anatómica y serie."""
    # Alta anatomía + alta serie → alta
    jc1 = construir_json_clinico(_analisis_con_anatomia())
    assert jc1["confianza_global"] == "alta"

    # Alta anatomía + baja serie (pocos cortes)
    analisis = _analisis_con_anatomia()
    analisis["n_cortes_analizados"] = 5
    jc2 = construir_json_clinico(analisis)
    assert jc2["confianza_global"] == "baja"

    # Sin anatomía → baja global
    jc3 = construir_json_clinico(_analisis_sin_anatomia())
    assert jc3["confianza_global"] == "baja"
    print("  PASS: test_confianza_global_minima")


# ══════════════════════════════════════════════════════════════════════════════
# 5. Limitaciones merge correcto
# ══════════════════════════════════════════════════════════════════════════════

def test_limitaciones_merge():
    """Limitaciones combinan advertencias técnicas y anatómicas."""
    analisis = _analisis_con_anatomia()
    analisis["advertencias_tecnicas"] = ["Error leyendo un corte"]
    jc = construir_json_clinico(analisis)
    assert "Error leyendo un corte" in jc["limitaciones"]
    assert any("heurísticas" in l.lower() for l in jc["limitaciones"])

    # Sin anatomía → limitación adicional
    jc2 = construir_json_clinico(_analisis_sin_anatomia())
    assert any("no disponible" in l.lower() for l in jc2["limitaciones"])
    print("  PASS: test_limitaciones_merge")


# ══════════════════════════════════════════════════════════════════════════════
# 6. Asimetrías vacías → lista vacía
# ══════════════════════════════════════════════════════════════════════════════

def test_asimetrias_vacias():
    """Sin asimetrías → lista vacía."""
    jc = construir_json_clinico(_analisis_con_anatomia())
    assert jc["asimetrias"] == []

    jc2 = construir_json_clinico(_analisis_sin_anatomia())
    assert jc2["asimetrias"] == []
    print("  PASS: test_asimetrias_vacias")


# ══════════════════════════════════════════════════════════════════════════════
# 7. Focos localizados correctamente
# ══════════════════════════════════════════════════════════════════════════════

def test_focos_localizados():
    """Focos de atenuación se incluyen en el JSON."""
    jc = construir_json_clinico(_analisis_con_anatomia())
    assert len(jc["focos_atenuacion"]) == 1
    foco = jc["focos_atenuacion"][0]
    assert foco["tipo"] == "alta_atenuacion"
    assert foco["lateralidad"] == "izquierdo"
    assert foco["region"] == "supratentorial"
    print("  PASS: test_focos_localizados")


# ══════════════════════════════════════════════════════════════════════════════
# 8. TC no-cerebro → anatómicos "no evaluable"
# ══════════════════════════════════════════════════════════════════════════════

def test_tc_no_cerebro():
    """TC de abdomen (sin anatomía cerebral) → hallazgos no evaluable."""
    analisis = {
        "modalidad": "CT",
        "metadata_tecnica": {
            "modalidad": "CT",
            "descripcion_estudio": "TC Abdomen con contraste",
            "descripcion_serie": "Axial Abdomen",
            "parte_del_cuerpo": "ABDOMEN",
            "grosor_corte_mm": "3.0",
            "fabricante": "GE",
            "modelo_equipo": "Revolution",
            "institucion": "DMC",
        },
        "analisis_cuantitativo": None,
        "advertencias_tecnicas": [],
        "n_cortes_analizados": 50,
        "n_cortes_total": 200,
    }
    jc = construir_json_clinico(analisis)
    assert jc["modalidad"] == "TC"
    assert jc["region"] != "Cerebro"
    assert jc["hallazgos_anatomicos"]["sistema_ventricular"] == "no evaluable"
    print("  PASS: test_tc_no_cerebro")


# ══════════════════════════════════════════════════════════════════════════════
# 9. Serie prioritaria correcta
# ══════════════════════════════════════════════════════════════════════════════

def test_serie_prioritaria():
    """Serie prioritaria tiene descripción y grosor correcto."""
    jc = construir_json_clinico(_analisis_con_anatomia())
    sp = jc["serie_prioritaria"]
    assert sp["descripcion"] == "Axial Brain 5.0mm"
    assert sp["grosor_mm"] == 5.0
    assert sp["confianza"] == "alta"
    print("  PASS: test_serie_prioritaria")


# ══════════════════════════════════════════════════════════════════════════════
# 10. Texto contexto incluye sección anatómica
# ══════════════════════════════════════════════════════════════════════════════

def test_contexto_incluye_anatomia():
    """construir_contexto_para_claude incluye sección anatómica cuando disponible."""
    from services.dicom_analysis_service import construir_contexto_para_claude

    analisis = _analisis_con_anatomia()
    contexto = construir_contexto_para_claude(analisis)
    assert "Análisis anatómico local:" in contexto
    assert "Sistema ventricular: normal" in contexto
    assert "Línea media: centrada" in contexto
    assert "Calota: integra" in contexto
    print("  PASS: test_contexto_incluye_anatomia")


# ── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_json_con_anatomia_completa,
        test_json_sin_anatomia,
        test_campos_requeridos,
        test_confianza_global_minima,
        test_limitaciones_merge,
        test_asimetrias_vacias,
        test_focos_localizados,
        test_tc_no_cerebro,
        test_serie_prioritaria,
        test_contexto_incluye_anatomia,
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
