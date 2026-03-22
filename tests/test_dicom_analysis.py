"""
Tests unitarios para limpieza técnica del análisis DICOM.
Cubre: detección SCOUT, priorización cerebro, limpieza de contexto.
"""
import sys
import os
import logging

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Suppress logger output during tests
logging.disable(logging.CRITICAL)

from services.dicom_analysis_service import (
    _is_scout_or_localizer,
    _is_brain_priority_series,
    _evaluar_confianza_serie,
    _priorizar_series,
    _construir_limitaciones,
    construir_contexto_multiserie,
    construir_contexto_para_claude,
)


# ── Helpers para construir series de prueba ──────────────────────────────────

def _serie_mock(desc="Axial Brain 5.0mm", body_part="HEAD", grosor="5.0",
                n_analizados=30, n_total=53, modalidad="CT",
                distribucion=None):
    """Crea un dict de serie simulada para pruebas."""
    if distribucion is None:
        distribucion = {
            "aire": {"porcentaje": 30.0, "hu_media": -900.0},
            "baja_atenuacion_extracraneal": {"porcentaje": 2.0, "hu_media": -400.0},
            "baja_atenuacion_grasa": {"porcentaje": 5.0, "hu_media": -50.0},
            "atenuacion_agua_tejidos": {"porcentaje": 42.5, "hu_media": 35.0},
            "atenuacion_50_100": {"porcentaje": 3.2, "hu_media": 72.0},
            "alta_atenuacion_100_400": {"porcentaje": 8.3, "hu_media": 257.7},
            "alta_atenuacion_400_1000": {"porcentaje": 3.1, "hu_media": 600.0},
            "muy_alta_atenuacion_gt1000": {"porcentaje": 0.5, "hu_media": 1200.0},
        }
    return {
        "modalidad": modalidad,
        "metadata_tecnica": {
            "modalidad": modalidad,
            "descripcion_estudio": "TC Cerebro sin contraste",
            "descripcion_serie": desc,
            "parte_del_cuerpo": body_part,
            "grosor_corte_mm": grosor,
            "espaciado_pixeles": "[0.5, 0.5]",
            "fabricante": "SIEMENS",
            "modelo_equipo": "SOMATOM Definition Flash",
            "institucion": "DMC",
            "contraste": "No especificado",
            "ruta_contraste": "",
        },
        "analisis_cuantitativo": {
            "tipo": "TC_Hounsfield",
            "distribucion_atenuacion": distribucion,
            "observaciones": [
                "Alta atenuación 100–400 HU: 8.3%",
                "Muy alta atenuación >1000 HU: 0.5%",
            ],
        },
        "advertencias_tecnicas": [],
        "n_cortes_analizados": n_analizados,
        "n_cortes_total": n_total,
    }


# ── Test 1: Detección SCOUT por descripción ──────────────────────────────────

def test_is_scout_detection():
    assert _is_scout_or_localizer("SCOUT") is True
    assert _is_scout_or_localizer("scout view") is True
    assert _is_scout_or_localizer("Localizer") is True
    assert _is_scout_or_localizer("Topogram 0.6") is True
    assert _is_scout_or_localizer("Surview") is True
    assert _is_scout_or_localizer("Overview") is True
    assert _is_scout_or_localizer("Pilot scan") is True
    # Non-SCOUT
    assert _is_scout_or_localizer("Axial Brain 5.0mm") is False
    assert _is_scout_or_localizer("Coronal Recon") is False
    assert _is_scout_or_localizer("") is False


# ── Test 2: Detección SCOUT por pocos cortes ─────────────────────────────────

def test_is_scout_few_slices():
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=1) is True
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=2) is True
    # No SCOUT por cortes
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=0) is False
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=3) is False
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=10) is False
    assert _is_scout_or_localizer("Serie cualquiera", n_cortes=53) is False


# ── Test 3: Detección prioridad cerebro ──────────────────────────────────────

def test_is_brain_priority():
    assert _is_brain_priority_series("Axial Brain 5mm") is True
    assert _is_brain_priority_series("HEAD") is True
    assert _is_brain_priority_series("Encefalo") is True
    assert _is_brain_priority_series("TC Cerebro") is True
    assert _is_brain_priority_series("Craneal") is True
    assert _is_brain_priority_series("Ax 5mm") is True
    assert _is_brain_priority_series("Axial Recon") is True
    # Non-brain
    assert _is_brain_priority_series("Abdomen") is False
    assert _is_brain_priority_series("Pelvis") is False
    assert _is_brain_priority_series("Torax") is False
    assert _is_brain_priority_series("") is False


# ── Test 4: SCOUT obtiene score=0 ───────────────────────────────────────────

def test_scout_gets_zero_score():
    serie = _serie_mock(desc="Scout", n_total=2, n_analizados=2)
    ev = _evaluar_confianza_serie(serie)
    assert ev["_score"] == 0
    assert ev["serie_util_reporte"] == "no"
    assert ev["es_scout"] is True


# ── Test 5: Serie cerebro obtiene bonus ──────────────────────────────────────

def test_brain_series_gets_bonus():
    serie_brain = _serie_mock(desc="Axial Brain 5.0mm", body_part="HEAD", grosor="5.0",
                              n_total=53, n_analizados=30)
    serie_other = _serie_mock(desc="Generic Serie", body_part="HEAD", grosor="5.0",
                              n_total=53, n_analizados=30)
    ev_brain = _evaluar_confianza_serie(serie_brain)
    ev_other = _evaluar_confianza_serie(serie_other)
    assert ev_brain["_score"] > ev_other["_score"]
    assert ev_brain["es_scout"] is False


# ── Test 6: SCOUT queda al final en priorización ────────────────────────────

def test_scout_last_in_priority():
    serie_brain = _serie_mock(desc="Axial Brain 5.0mm", n_total=53)
    serie_scout = _serie_mock(desc="Scout", n_total=2, n_analizados=2)
    serie_thin = _serie_mock(desc="Axial Brain 1.25mm", grosor="1.25", n_total=200)

    resultado = _priorizar_series([serie_scout, serie_brain, serie_thin])

    # SCOUT debe estar al final
    assert resultado[-1].get("_evaluacion", {}).get("es_scout") is True
    # Primera serie debe ser una Brain, no SCOUT
    assert resultado[0].get("_evaluacion", {}).get("es_scout") is False


# ── Test 7: Limitaciones no contienen números crudos ─────────────────────────

def test_limitaciones_no_raw_numbers():
    serie = _serie_mock(n_total=53, n_analizados=13)
    serie["_evaluacion"] = _evaluar_confianza_serie(serie)
    limitaciones = _construir_limitaciones([serie], total_instancias=53, total_analizadas=13)
    texto = " ".join(limitaciones)
    assert "de 53 imágenes" not in texto
    assert "(24.5%)" not in texto
    assert "13 de" not in texto
    # Debe tener la versión limpia
    assert "muestreo representativo" in texto.lower()


# ── Test 8: Contexto no contiene HU media por banda ─────────────────────────

def test_contexto_no_hu_media():
    serie_a = _serie_mock(desc="Axial Brain 5.0mm", n_total=53)
    serie_b = _serie_mock(desc="Axial Brain 1.25mm", grosor="1.25", n_total=200)

    contexto = construir_contexto_multiserie([serie_a, serie_b], total_instancias=253, total_analizadas=60)
    assert "(HU media:" not in contexto

    # Single serie path
    contexto_single = construir_contexto_para_claude(serie_a)
    assert "(HU media:" not in contexto_single


# ── Test 9: Contexto no contiene "Cortes analizados:" ────────────────────────

def test_contexto_no_slice_counts():
    serie_a = _serie_mock(desc="Axial Brain 5.0mm", n_total=53)
    serie_b = _serie_mock(desc="Axial Brain 1.25mm", grosor="1.25", n_total=200)

    contexto = construir_contexto_multiserie([serie_a, serie_b], total_instancias=253, total_analizadas=60)
    assert "Cortes analizados:" not in contexto
    assert "Imágenes analizadas por muestreo" not in contexto
    assert "series detectadas" not in contexto.lower()
    # Debe tener la versión limpia
    assert "Series útiles para evaluación" in contexto

    # Single serie path
    contexto_single = construir_contexto_para_claude(serie_a)
    assert "Cortes analizados:" not in contexto_single
    assert "Imágenes analizadas por muestreo" not in contexto_single


# ── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
