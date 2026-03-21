"""
Análisis local de archivos DICOM usando pydicom + numpy.
Extrae metadata técnica y métricas cuantitativas del pixel data.
NINGÚN pixel ni imagen se envía a APIs externas.
Solo el resultado textual se envía a Claude API para redactar el informe.
"""
import pydicom
import numpy as np
import io
from typing import Optional


# Rangos de Unidades Hounsfield por banda de atenuación (TC)
# Etiquetas neutras — sin diagnóstico implícito
HU_RANGES_TC = {
    "aire":                      (-1000, -700),
    "baja_atenuacion_extracraneal":  (-700,  -200),
    "baja_atenuacion_grasa":     (-200,  -10),
    "atenuacion_agua_tejidos":   (-10,   80),
    "atenuacion_50_100":         (50,    100),
    "alta_atenuacion_100_400":   (100,   400),
    "alta_atenuacion_400_1000":  (400,   1000),
    "muy_alta_atenuacion_gt1000": (1000, 3000),
}

# Parámetros de secuencia RM relevantes para el informe
RM_SEQUENCE_PARAMS = [
    "EchoTime", "RepetitionTime", "InversionTime",
    "FlipAngle", "MagneticFieldStrength", "SequenceName",
    "ScanningSequence", "SequenceVariant", "ImageType",
]


def analizar_dicom(dicom_bytes: bytes) -> dict:
    """
    Analiza un archivo DICOM en memoria.
    Retorna un dict con metadata técnica y análisis cuantitativo.
    """
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
    modalidad = getattr(ds, "Modality", "").upper()

    resultado = {
        "modalidad": modalidad,
        "metadata_tecnica": _extraer_metadata(ds),
        "analisis_cuantitativo": None,
        "advertencias_tecnicas": [],
    }

    if hasattr(ds, "PixelData"):
        try:
            pixel_array = ds.pixel_array.astype(float)

            if modalidad in ("CT", "TC"):
                resultado["analisis_cuantitativo"] = _analizar_hu(ds, pixel_array)
            elif modalidad in ("MR", "RM"):
                resultado["analisis_cuantitativo"] = _analizar_rm(ds, pixel_array)
            elif modalidad in ("US", "ECO"):
                resultado["analisis_cuantitativo"] = _analizar_eco(ds, pixel_array)
            elif modalidad in ("DX", "CR", "RX"):
                resultado["analisis_cuantitativo"] = _analizar_rx(ds, pixel_array)

        except Exception as e:
            resultado["advertencias_tecnicas"].append(
                f"No se pudo analizar pixel data: {str(e)}"
            )

    return resultado


def _extraer_metadata(ds) -> dict:
    def safe_get(attr, default="No especificado"):
        val = getattr(ds, attr, default)
        return str(val) if val is not None else default

    return {
        "modalidad":             safe_get("Modality"),
        "descripcion_estudio":   safe_get("StudyDescription"),
        "descripcion_serie":     safe_get("SeriesDescription"),
        "parte_del_cuerpo":      safe_get("BodyPartExamined"),
        "posicion_paciente":     safe_get("PatientPosition"),
        "kvp":                   safe_get("KVP"),
        "mas":                   safe_get("Exposure"),
        "tiempo_exposicion_ms":  safe_get("ExposureTime"),
        "grosor_corte_mm":       safe_get("SliceThickness"),
        "espaciado_pixeles":     str(getattr(ds, "PixelSpacing", "No especificado")),
        "fov":                   safe_get("ReconstructionDiameter"),
        "contraste":             safe_get("ContrastBolusAgent"),
        "ruta_contraste":        safe_get("ContrastBolusRoute"),
        "n_cortes":              safe_get("NumberOfSlices"),
        "fabricante":            safe_get("Manufacturer"),
        "modelo_equipo":         safe_get("ManufacturerModelName"),
        "institucion":           safe_get("InstitutionName"),
        "fecha_estudio":         safe_get("StudyDate"),
        "hora_estudio":          safe_get("StudyTime"),
        "numero_acceso":         safe_get("AccessionNumber"),
    }


def _analizar_hu(ds, pixel_array: np.ndarray) -> dict:
    slope = float(getattr(ds, "RescaleSlope", 1))
    intercept = float(getattr(ds, "RescaleIntercept", -1024))
    hu_array = pixel_array * slope + intercept

    total = hu_array.size
    distribucion = {}

    for tejido, (hu_min, hu_max) in HU_RANGES_TC.items():
        mascara = (hu_array >= hu_min) & (hu_array <= hu_max)
        n_pixels = int(mascara.sum())
        distribucion[tejido] = {
            "porcentaje": round((n_pixels / total) * 100, 2),
            "hu_media": round(float(hu_array[mascara].mean()), 1) if mascara.any() else None,
        }

    observaciones = []
    if distribucion["alta_atenuacion_100_400"]["porcentaje"] > 2.0:
        observaciones.append(
            f"Alta atenuación 100–400 HU: {distribucion['alta_atenuacion_100_400']['porcentaje']}%"
        )
    if distribucion["muy_alta_atenuacion_gt1000"]["porcentaje"] > 0.1:
        observaciones.append(
            f"Muy alta atenuación >1000 HU: {distribucion['muy_alta_atenuacion_gt1000']['porcentaje']}%"
        )
    if distribucion["atenuacion_50_100"]["porcentaje"] > 1.5:
        observaciones.append(
            f"Atenuación 50–100 HU: {distribucion['atenuacion_50_100']['porcentaje']}%"
        )
    if distribucion["aire"]["porcentaje"] > 60:
        observaciones.append(
            f"Aire: {distribucion['aire']['porcentaje']}%"
        )

    return {
        "tipo": "TC_Hounsfield",
        "estadisticas_globales": {
            "hu_min":   round(float(hu_array.min()), 1),
            "hu_max":   round(float(hu_array.max()), 1),
            "hu_media": round(float(hu_array.mean()), 1),
            "hu_desv":  round(float(hu_array.std()), 1),
        },
        "distribucion_atenuacion": distribucion,
        "observaciones": observaciones,
    }


def _analizar_rm(ds, pixel_array: np.ndarray) -> dict:
    total = pixel_array.size
    p5, p25, p50, p75, p95 = np.percentile(pixel_array, [5, 25, 50, 75, 95])

    params_secuencia = {}
    for param in RM_SEQUENCE_PARAMS:
        val = getattr(ds, param, None)
        if val is not None:
            params_secuencia[param] = str(val)

    te = float(getattr(ds, "EchoTime", 0) or 0)
    tr = float(getattr(ds, "RepetitionTime", 0) or 0)
    tipo_secuencia = "No determinado"
    if tr > 0 and te > 0:
        if tr < 800 and te < 30:
            tipo_secuencia = "T1 (TR corto, TE corto)"
        elif tr > 2000 and te > 80:
            tipo_secuencia = "T2 (TR largo, TE largo)"
        elif tr > 6000 and te > 80:
            tipo_secuencia = "FLAIR / PD (TR muy largo)"

    h, w = pixel_array.shape[-2], pixel_array.shape[-1]
    roi_signal = pixel_array[..., h // 4:3 * h // 4, w // 4:3 * w // 4]
    roi_noise = pixel_array[..., :h // 10, :w // 10]
    snr_estimado = None
    if float(roi_noise.std()) > 0:
        snr_estimado = round(float(roi_signal.mean()) / float(roi_noise.std()), 1)

    return {
        "tipo": "RM_Intensidades",
        "campo_magnetico_T": str(getattr(ds, "MagneticFieldStrength", "No especificado")),
        "tipo_secuencia_inferido": tipo_secuencia,
        "parametros_secuencia": params_secuencia,
        "estadisticas_senal": {
            "senal_min":    round(float(pixel_array.min()), 1),
            "senal_max":    round(float(pixel_array.max()), 1),
            "senal_media":  round(float(pixel_array.mean()), 1),
            "senal_desv":   round(float(pixel_array.std()), 1),
            "p5":           round(float(p5), 1),
            "p95":          round(float(p95), 1),
            "snr_estimado": snr_estimado,
        },
        "zonas_hiperintensas_pct": round(float((pixel_array > p95).sum() / total * 100), 2),
        "zonas_hipointensas_pct": round(float((pixel_array < p5).sum() / total * 100), 2),
    }


def _analizar_eco(ds, pixel_array: np.ndarray) -> dict:
    total = pixel_array.size
    p5, p25, p75, p95 = np.percentile(pixel_array, [5, 25, 75, 95])

    pct_hipoecoico = round(float((pixel_array < p25).sum() / total * 100), 2)
    pct_hiperecoico = round(float((pixel_array > p75).sum() / total * 100), 2)
    pct_anecoico = round(float((pixel_array < p5).sum() / total * 100), 2)

    observaciones = []
    if pct_anecoico > 5:
        observaciones.append(
            f"Zonas anecoicas: {pct_anecoico}%"
        )
    if pct_hiperecoico > 20:
        observaciones.append(
            f"Alta ecogenicidad: {pct_hiperecoico}%"
        )

    return {
        "tipo": "ECO_Ecogenicidad",
        "frecuencia_transductor": str(getattr(ds, "TransducerFrequency", "No especificado")),
        "estadisticas_ecogenicidad": {
            "intensidad_min":   round(float(pixel_array.min()), 1),
            "intensidad_max":   round(float(pixel_array.max()), 1),
            "intensidad_media": round(float(pixel_array.mean()), 1),
            "intensidad_desv":  round(float(pixel_array.std()), 1),
        },
        "distribucion": {
            "pct_anecoico":    pct_anecoico,
            "pct_hipoecoico":  pct_hipoecoico,
            "pct_hiperecoico": pct_hiperecoico,
        },
        "observaciones": observaciones,
    }


def _analizar_rx(ds, pixel_array: np.ndarray) -> dict:
    total = pixel_array.size
    p5, p95 = np.percentile(pixel_array, [5, 95])

    pct_hiperluente = round(float((pixel_array < p5).sum() / total * 100), 2)
    pct_radioopaco = round(float((pixel_array > p95).sum() / total * 100), 2)

    observaciones = []
    if pct_radioopaco > 15:
        observaciones.append(
            f"Alta densidad radiológica: {pct_radioopaco}%"
        )
    if pct_hiperluente > 30:
        observaciones.append(
            f"Alta hiperlucencia: {pct_hiperluente}%"
        )

    return {
        "tipo": "RX_Densidades",
        "kvp": str(getattr(ds, "KVP", "No especificado")),
        "mas": str(getattr(ds, "Exposure", "No especificado")),
        "estadisticas": {
            "densidad_min":   round(float(pixel_array.min()), 1),
            "densidad_max":   round(float(pixel_array.max()), 1),
            "densidad_media": round(float(pixel_array.mean()), 1),
        },
        "distribucion": {
            "pct_hiperlucente": pct_hiperluente,
            "pct_radioopaco":   pct_radioopaco,
        },
        "observaciones": observaciones,
    }


def analizar_serie(dicom_bytes_list: list[bytes], n_total_instancias: int = 0) -> dict:
    """
    Analiza múltiples cortes DICOM de una serie.
    Si 1 solo corte → delega a analizar_dicom().
    Si múltiples → combina pixel arrays y calcula estadísticas globales.
    """
    if len(dicom_bytes_list) == 1:
        resultado = analizar_dicom(dicom_bytes_list[0])
        resultado["n_cortes_analizados"] = 1
        resultado["n_cortes_total"] = n_total_instancias or 1
        return resultado

    # Metadata técnica: del primer corte (común a toda la serie)
    primer_ds = pydicom.dcmread(io.BytesIO(dicom_bytes_list[0]))
    modalidad = getattr(primer_ds, "Modality", "").upper()

    resultado = {
        "modalidad": modalidad,
        "metadata_tecnica": _extraer_metadata(primer_ds),
        "analisis_cuantitativo": None,
        "advertencias_tecnicas": [],
        "n_cortes_analizados": len(dicom_bytes_list),
        "n_cortes_total": n_total_instancias or len(dicom_bytes_list),
    }

    # Collect pixel arrays from all slices
    pixel_arrays = []
    for dcm_bytes in dicom_bytes_list:
        try:
            ds = pydicom.dcmread(io.BytesIO(dcm_bytes))
            if hasattr(ds, "PixelData"):
                pixel_arrays.append((ds, ds.pixel_array.astype(float)))
        except Exception as e:
            resultado["advertencias_tecnicas"].append(f"Error leyendo corte: {e}")

    if not pixel_arrays:
        return resultado

    try:
        if modalidad in ("CT", "TC"):
            resultado["analisis_cuantitativo"] = _analizar_hu_multislice(pixel_arrays)
        elif modalidad in ("MR", "RM"):
            resultado["analisis_cuantitativo"] = _analizar_rm_multislice(pixel_arrays)
        elif modalidad in ("US", "ECO"):
            # Ecografía: usar solo primer corte (no es volumétrica)
            ds0, pa0 = pixel_arrays[0]
            resultado["analisis_cuantitativo"] = _analizar_eco(ds0, pa0)
        elif modalidad in ("DX", "CR", "RX"):
            ds0, pa0 = pixel_arrays[0]
            resultado["analisis_cuantitativo"] = _analizar_rx(ds0, pa0)
    except Exception as e:
        resultado["advertencias_tecnicas"].append(f"Error en análisis multi-corte: {e}")

    return resultado


def _analizar_hu_multislice(pixel_arrays: list[tuple]) -> dict:
    """Análisis Hounsfield combinando múltiples cortes TC."""
    all_hu = []
    for ds, pixel_array in pixel_arrays:
        slope = float(getattr(ds, "RescaleSlope", 1))
        intercept = float(getattr(ds, "RescaleIntercept", -1024))
        hu_slice = pixel_array * slope + intercept
        all_hu.append(hu_slice.ravel())

    hu_combined = np.concatenate(all_hu)
    total = hu_combined.size

    distribucion = {}
    for tejido, (hu_min, hu_max) in HU_RANGES_TC.items():
        mascara = (hu_combined >= hu_min) & (hu_combined <= hu_max)
        n_pixels = int(mascara.sum())
        distribucion[tejido] = {
            "porcentaje": round((n_pixels / total) * 100, 2),
            "hu_media": round(float(hu_combined[mascara].mean()), 1) if mascara.any() else None,
        }

    observaciones = []
    if distribucion["alta_atenuacion_100_400"]["porcentaje"] > 2.0:
        observaciones.append(
            f"Alta atenuación 100–400 HU: {distribucion['alta_atenuacion_100_400']['porcentaje']}%"
        )
    if distribucion["muy_alta_atenuacion_gt1000"]["porcentaje"] > 0.1:
        observaciones.append(
            f"Muy alta atenuación >1000 HU: {distribucion['muy_alta_atenuacion_gt1000']['porcentaje']}%"
        )
    if distribucion["atenuacion_50_100"]["porcentaje"] > 1.5:
        observaciones.append(
            f"Atenuación 50–100 HU: {distribucion['atenuacion_50_100']['porcentaje']}%"
        )
    if distribucion["aire"]["porcentaje"] > 60:
        observaciones.append(
            f"Aire: {distribucion['aire']['porcentaje']}%"
        )

    return {
        "tipo": "TC_Hounsfield",
        "estadisticas_globales": {
            "hu_min":   round(float(hu_combined.min()), 1),
            "hu_max":   round(float(hu_combined.max()), 1),
            "hu_media": round(float(hu_combined.mean()), 1),
            "hu_desv":  round(float(hu_combined.std()), 1),
        },
        "distribucion_atenuacion": distribucion,
        "observaciones": observaciones,
    }


def _analizar_rm_multislice(pixel_arrays: list[tuple]) -> dict:
    """Análisis RM combinando múltiples cortes."""
    all_pixels = np.concatenate([pa.ravel() for _, pa in pixel_arrays])
    total = all_pixels.size
    p5, p25, p50, p75, p95 = np.percentile(all_pixels, [5, 25, 50, 75, 95])

    # Params from first slice
    ds0 = pixel_arrays[0][0]
    params_secuencia = {}
    for param in RM_SEQUENCE_PARAMS:
        val = getattr(ds0, param, None)
        if val is not None:
            params_secuencia[param] = str(val)

    te = float(getattr(ds0, "EchoTime", 0) or 0)
    tr = float(getattr(ds0, "RepetitionTime", 0) or 0)
    tipo_secuencia = "No determinado"
    if tr > 0 and te > 0:
        if tr < 800 and te < 30:
            tipo_secuencia = "T1 (TR corto, TE corto)"
        elif tr > 2000 and te > 80:
            tipo_secuencia = "T2 (TR largo, TE largo)"
        elif tr > 6000 and te > 80:
            tipo_secuencia = "FLAIR / PD (TR muy largo)"

    # SNR from first slice
    pa0 = pixel_arrays[0][1]
    h, w = pa0.shape[-2], pa0.shape[-1]
    roi_signal = pa0[..., h // 4:3 * h // 4, w // 4:3 * w // 4]
    roi_noise = pa0[..., :h // 10, :w // 10]
    snr_estimado = None
    if float(roi_noise.std()) > 0:
        snr_estimado = round(float(roi_signal.mean()) / float(roi_noise.std()), 1)

    return {
        "tipo": "RM_Intensidades",
        "campo_magnetico_T": str(getattr(ds0, "MagneticFieldStrength", "No especificado")),
        "tipo_secuencia_inferido": tipo_secuencia,
        "parametros_secuencia": params_secuencia,
        "estadisticas_senal": {
            "senal_min":    round(float(all_pixels.min()), 1),
            "senal_max":    round(float(all_pixels.max()), 1),
            "senal_media":  round(float(all_pixels.mean()), 1),
            "senal_desv":   round(float(all_pixels.std()), 1),
            "p5":           round(float(p5), 1),
            "p95":          round(float(p95), 1),
            "snr_estimado": snr_estimado,
        },
        "zonas_hiperintensas_pct": round(float((all_pixels > p95).sum() / total * 100), 2),
        "zonas_hipointensas_pct": round(float((all_pixels < p5).sum() / total * 100), 2),
    }


# ── Helpers de presentación ────────────────────────────────────────────────

# Umbral mínimo de porcentaje para mostrar una banda de atenuación
_MIN_PCT_DISPLAY = 0.1


def _region_display(parte_del_cuerpo: str) -> str:
    """Retorna texto de región con concordancia de género."""
    if not parte_del_cuerpo or parte_del_cuerpo == "No especificado":
        return "No especificada"
    return parte_del_cuerpo


def _serie_display(descripcion_serie: str) -> str:
    """Retorna nombre de serie, nunca vacío."""
    if not descripcion_serie or descripcion_serie.strip() in ("", "No especificado"):
        return "No descrita"
    return descripcion_serie.strip()


# ── Evaluación de confianza y prioridad por serie ─────────────────────────

# Display labels for distribution keys (neutral, user-facing)
_DIST_LABELS = {
    "aire":                       "Aire",
    "baja_atenuacion_extracraneal": "Baja atenuación extracraneal",
    "baja_atenuacion_grasa":      "Baja atenuación grasa",
    "atenuacion_agua_tejidos":    "Atenuación agua/tejidos",
    "atenuacion_50_100":          "Atenuación 50–100 HU",
    "alta_atenuacion_100_400":    "Alta atenuación 100–400 HU",
    "alta_atenuacion_400_1000":   "Alta atenuación 400–1000 HU",
    "muy_alta_atenuacion_gt1000": "Muy alta atenuación >1000 HU",
}


def _evaluar_confianza_serie(serie: dict) -> dict:
    """Evalúa confianza anatómica, utilidad para reporte y contenido extracraneal."""
    meta = serie.get("metadata_tecnica", {})
    cuant = serie.get("analisis_cuantitativo")
    n_analizados = serie.get("n_cortes_analizados", 0)
    n_total = serie.get("n_cortes_total", 0)

    # ── Confianza anatómica ──
    body_part = str(meta.get("parte_del_cuerpo", "")).strip()
    grosor_raw = meta.get("grosor_corte_mm", "No especificado")
    try:
        grosor = float(grosor_raw)
    except (ValueError, TypeError):
        grosor = None

    score = 0
    if body_part and body_part != "No especificado":
        score += 2
    if n_total >= 20:
        score += 2
    elif n_total >= 5:
        score += 1
    if grosor is not None and grosor <= 5.0:
        score += 1

    if score >= 4:
        confianza_anat = "alta"
    elif score >= 2:
        confianza_anat = "media"
    else:
        confianza_anat = "baja"

    # ── Útil para reporte ──
    util_reporte = "sí" if confianza_anat in ("alta", "media") and n_analizados >= 3 else "no"

    # ── Contenido extracraneal ──
    # Heurística: pct_extra (banda -700 a -200 HU) es el indicador principal.
    # El aire alto es normal en TC de cabeza, así que requiere umbral más exigente.
    contenido_extra = "bajo"
    if cuant and cuant.get("distribucion_atenuacion"):
        dist = cuant["distribucion_atenuacion"]
        pct_aire = dist.get("aire", {}).get("porcentaje", 0)
        pct_extra = dist.get("baja_atenuacion_extracraneal", {}).get("porcentaje", 0)
        if pct_extra > 15 or (pct_extra > 10 and pct_aire > 50):
            contenido_extra = "alto"
        elif pct_extra > 5 or pct_aire > 40:
            contenido_extra = "moderado"

    return {
        "confianza_anatomica": confianza_anat,
        "serie_util_reporte": util_reporte,
        "contenido_extracraneal": contenido_extra,
        "_score": score,
    }


def _priorizar_series(resultados_series: list[dict]) -> list[dict]:
    """Ordena series por prioridad para evaluación (mayor score primero)."""
    evaluaciones = []
    for serie in resultados_series:
        ev = _evaluar_confianza_serie(serie)
        serie["_evaluacion"] = ev
        n_total = serie.get("n_cortes_total", 0)
        # Priority: confidence score + number of slices
        priority = ev["_score"] * 100 + n_total
        evaluaciones.append((priority, serie))
    evaluaciones.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in evaluaciones]


def _construir_limitaciones(series_priorizadas: list[dict], total_instancias: int, total_analizadas: int) -> list[str]:
    """Construye la sección de limitaciones del análisis."""
    limitaciones = []

    # Región no especificada
    meta = series_priorizadas[0].get("metadata_tecnica", {})
    body_part = str(meta.get("parte_del_cuerpo", "")).strip()
    if not body_part or body_part == "No especificado":
        limitaciones.append("Región anatómica no especificada en metadatos DICOM.")

    # Muestreo parcial
    if total_analizadas < total_instancias:
        pct = round(total_analizadas / total_instancias * 100, 1) if total_instancias > 0 else 0
        limitaciones.append(
            f"Muestreo parcial del estudio: {total_analizadas} de {total_instancias} imágenes analizadas ({pct}%)."
        )

    # Series con baja confianza
    for i, serie in enumerate(series_priorizadas):
        ev = serie.get("_evaluacion", {})
        if ev.get("confianza_anatomica") == "baja":
            raw_desc = serie.get("metadata_tecnica", {}).get("descripcion_serie", "")
            desc = _serie_display(raw_desc)
            if i > 0:
                limitaciones.append(f"Serie secundaria con baja confianza anatómica.")
            else:
                limitaciones.append(f"Serie \"{desc}\" con baja confianza anatómica.")

    limitaciones.append("La caracterización anatómica definitiva requiere revisión directa de las imágenes.")

    return limitaciones


def construir_contexto_multiserie(
    resultados_series: list[dict],
    total_instancias: int,
    total_analizadas: int,
) -> str:
    """
    Construye un contexto técnico neutro, priorizado por serie, con limitaciones.
    Sin lenguaje diagnóstico. Solo bandas de atenuación, focos y datos cuantitativos.
    """
    if len(resultados_series) == 1:
        return construir_contexto_para_claude(resultados_series[0])

    # Priorizar series
    series_priorizadas = _priorizar_series(resultados_series)
    meta = series_priorizadas[0]["metadata_tecnica"]
    modalidad = series_priorizadas[0]["modalidad"]

    lineas = [
        "ANÁLISIS DICOM",
        "",
        f"Modalidad: {meta['modalidad']}",
        f"Región: {_region_display(meta['parte_del_cuerpo'])}",
        f"Descripción del estudio: {meta['descripcion_estudio']}",
        f"Equipo: {meta['fabricante']} {meta['modelo_equipo']}",
        f"Institución: {meta['institucion']}",
        "",
        "Resumen general:",
        f"- Total de series detectadas: {len(series_priorizadas)}",
        f"- Total de imágenes del estudio: {total_instancias}",
        f"- Imágenes analizadas por muestreo: {total_analizadas}",
    ]

    # Render each series with priority labels
    for i, serie in enumerate(series_priorizadas):
        s_meta = serie["metadata_tecnica"]
        s_cuant = serie.get("analisis_cuantitativo")
        ev = serie.get("_evaluacion", {})
        n_anal = serie.get("n_cortes_analizados", "?")
        n_total = serie.get("n_cortes_total", "?")
        desc = _serie_display(s_meta.get("descripcion_serie", ""))

        if i == 0:
            label = "Serie prioritaria para evaluación"
        else:
            label = f"Serie secundaria" if len(series_priorizadas) == 2 else f"Serie {i+1} (no prioritaria)"
            if ev.get("confianza_anatomica") == "baja" or ev.get("serie_util_reporte") == "no":
                label += " — no prioritaria para reporte"

        lineas += [
            "",
            f"{label}:",
            f"- Serie: {desc}",
            f"- Cortes analizados: {n_anal} de {n_total}",
            f"- Grosor de corte: {s_meta.get('grosor_corte_mm', '?')} mm",
            f"- Espaciado de píxeles: {s_meta.get('espaciado_pixeles', '?')}",
            f"- Confianza anatómica: {ev.get('confianza_anatomica', '?')}",
            f"- Serie útil para reporte: {ev.get('serie_util_reporte', '?')}",
            f"- Contenido extracraneal: {ev.get('contenido_extracraneal', '?')}",
        ]

        contraste = s_meta.get("contraste", "")
        if contraste and contraste != "No especificado":
            lineas.append(f"- Contraste: {contraste} ({s_meta.get('ruta_contraste', '')})")

        # Distribution (TC)
        if modalidad in ("CT", "TC") and s_cuant:
            dist_label = "Distribución de atenuación de la serie prioritaria" if i == 0 else "Distribución de atenuación de la serie secundaria"
            lineas += ["", f"{dist_label}:"]
            dist = s_cuant["distribucion_atenuacion"]
            for key in HU_RANGES_TC:
                if key in dist:
                    pct = dist[key]["porcentaje"]
                    if pct < _MIN_PCT_DISPLAY:
                        continue
                    label_name = _DIST_LABELS.get(key, key)
                    hu_m = dist[key].get("hu_media")
                    line = f"- {label_name}: {pct}%"
                    if hu_m is not None:
                        line += f" (HU media: {hu_m})"
                    lineas.append(line)

        # RM
        elif modalidad in ("MR", "RM") and s_cuant:
            lineas += [
                f"- Secuencia inferida: {s_cuant['tipo_secuencia_inferido']}",
                f"- Campo magnético: {s_cuant['campo_magnetico_T']} T",
                f"- SNR estimado: {s_cuant['estadisticas_senal']['snr_estimado']}",
                f"- Zonas hiperintensas: {s_cuant['zonas_hiperintensas_pct']}%",
                f"- Zonas hipointensas: {s_cuant['zonas_hipointensas_pct']}%",
            ]

        # ECO
        elif modalidad in ("US", "ECO") and s_cuant:
            lineas += [
                f"- Anecoico: {s_cuant['distribucion']['pct_anecoico']}%",
                f"- Hipoecoico: {s_cuant['distribucion']['pct_hipoecoico']}%",
                f"- Hiperecoico: {s_cuant['distribucion']['pct_hiperecoico']}%",
            ]

        # RX
        elif modalidad in ("DX", "CR", "RX") and s_cuant:
            lineas += [
                f"- kVp: {s_cuant['kvp']} / mAs: {s_cuant['mas']}",
                f"- Hiperlucencia: {s_cuant['distribucion']['pct_hiperlucente']}%",
                f"- Radiopacidad: {s_cuant['distribucion']['pct_radioopaco']}%",
            ]

        advs = serie.get("advertencias_tecnicas", [])
        if advs:
            for adv in advs:
                lineas.append(f"- Advertencia: {adv}")

    # Limitaciones
    limitaciones = _construir_limitaciones(series_priorizadas, total_instancias, total_analizadas)
    lineas += ["", "Limitaciones:"]
    for lim in limitaciones:
        lineas.append(f"- {lim}")

    # Resumen técnico priorizado
    serie_prio = series_priorizadas[0]
    desc_prio = _serie_display(serie_prio.get("metadata_tecnica", {}).get("descripcion_serie", ""))
    lineas += [
        "",
        "Resumen técnico priorizado:",
        f"- Serie prioritaria para evaluación: {desc_prio}.",
    ]

    # Collect observations from priority series
    cuant_prio = serie_prio.get("analisis_cuantitativo")
    if cuant_prio and cuant_prio.get("observaciones"):
        obs_list = cuant_prio["observaciones"]
        # Extract band names for concise summary
        bandas_resumen = []
        for obs in obs_list:
            if "100–400 HU" in obs:
                bandas_resumen.append("100–400 HU")
            elif ">1000 HU" in obs:
                bandas_resumen.append(">1000 HU")
            elif "50–100 HU" in obs:
                bandas_resumen.append("50–100 HU")
            else:
                bandas_resumen.append(obs)
        lineas.append(f"- Se identifican focos en bandas de atenuación {' y '.join(bandas_resumen)}.")
    else:
        lineas.append("- No se identifican focos relevantes en bandas de atenuación.")

    lineas.append("- Hallazgos cuantitativos sin caracterización anatómica definitiva en esta etapa.")

    return "\n".join(lineas)


def construir_contexto_para_claude(analisis: dict) -> str:
    """
    Convierte el análisis DICOM de una serie en texto técnico neutro.
    Formato unificado con confianza, limitaciones y resumen priorizado.
    """
    meta = analisis["metadata_tecnica"]
    cuant = analisis["analisis_cuantitativo"]
    modalidad = analisis["modalidad"]

    n_analizados = analisis.get("n_cortes_analizados")
    n_total = analisis.get("n_cortes_total")

    # Evaluate series confidence
    ev = _evaluar_confianza_serie(analisis)
    analisis["_evaluacion"] = ev

    lineas = [
        "ANÁLISIS DICOM",
        "",
        f"Modalidad: {meta['modalidad']}",
        f"Región: {_region_display(meta['parte_del_cuerpo'])}",
        f"Descripción del estudio: {meta['descripcion_estudio']}",
        f"Equipo: {meta['fabricante']} {meta['modelo_equipo']}",
        f"Institución: {meta['institucion']}",
        "",
        "Resumen general:",
        "- Total de series detectadas: 1",
        f"- Total de imágenes del estudio: {n_total or meta.get('n_cortes', '?')}",
        f"- Imágenes analizadas por muestreo: {n_analizados or '?'}",
        "",
        "Serie prioritaria para evaluación:",
        f"- Serie: {_serie_display(meta.get('descripcion_serie', ''))}",
        f"- Cortes analizados: {n_analizados or '?'} de {n_total or '?'}",
        f"- Grosor de corte: {meta['grosor_corte_mm']} mm",
        f"- Espaciado de píxeles: {meta['espaciado_pixeles']}",
        f"- Confianza anatómica: {ev['confianza_anatomica']}",
        f"- Serie útil para reporte: {ev['serie_util_reporte']}",
        f"- Contenido extracraneal: {ev['contenido_extracraneal']}",
    ]

    contraste = meta.get("contraste", "")
    if contraste and contraste != "No especificado":
        lineas.append(f"- Contraste: {contraste} ({meta.get('ruta_contraste', '')})")

    # Distribution (TC)
    if modalidad in ("CT", "TC") and cuant:
        lineas += ["", "Distribución de atenuación de la serie prioritaria:"]
        dist = cuant["distribucion_atenuacion"]
        for key in HU_RANGES_TC:
            if key in dist:
                pct = dist[key]["porcentaje"]
                if pct < _MIN_PCT_DISPLAY:
                    continue
                label_name = _DIST_LABELS.get(key, key)
                hu_m = dist[key].get("hu_media")
                line = f"- {label_name}: {pct}%"
                if hu_m is not None:
                    line += f" (HU media: {hu_m})"
                lineas.append(line)

    elif modalidad in ("MR", "RM") and cuant:
        lineas += [
            "",
            "Parámetros de secuencia:",
            f"- Campo magnético: {cuant['campo_magnetico_T']} T",
            f"- Secuencia inferida: {cuant['tipo_secuencia_inferido']}",
            f"- SNR estimado: {cuant['estadisticas_senal']['snr_estimado']}",
            f"- Zonas hiperintensas: {cuant['zonas_hiperintensas_pct']}%",
            f"- Zonas hipointensas: {cuant['zonas_hipointensas_pct']}%",
        ]
        for param, val in cuant["parametros_secuencia"].items():
            lineas.append(f"- {param}: {val}")

    elif modalidad in ("US", "ECO") and cuant:
        lineas += [
            "",
            "Ecogenicidad:",
            f"- Frecuencia transductor: {cuant['frecuencia_transductor']}",
            f"- Anecoico: {cuant['distribucion']['pct_anecoico']}%",
            f"- Hipoecoico: {cuant['distribucion']['pct_hipoecoico']}%",
            f"- Hiperecoico: {cuant['distribucion']['pct_hiperecoico']}%",
        ]

    elif modalidad in ("DX", "CR", "RX") and cuant:
        lineas += [
            "",
            "Densidades radiológicas:",
            f"- kVp: {cuant['kvp']} / mAs: {cuant['mas']}",
            f"- Hiperlucencia: {cuant['distribucion']['pct_hiperlucente']}%",
            f"- Radiopacidad: {cuant['distribucion']['pct_radioopaco']}%",
        ]

    # Limitaciones
    limitaciones = _construir_limitaciones(
        [analisis],
        n_total or 0,
        n_analizados or 0,
    )
    lineas += ["", "Limitaciones:"]
    for lim in limitaciones:
        lineas.append(f"- {lim}")

    # Resumen técnico priorizado
    desc_serie = _serie_display(meta.get("descripcion_serie", ""))
    lineas += [
        "",
        "Resumen técnico priorizado:",
        f"- Serie prioritaria para evaluación: {desc_serie}.",
    ]

    if cuant and cuant.get("observaciones"):
        obs_list = cuant["observaciones"]
        bandas_resumen = []
        for obs in obs_list:
            if "100–400 HU" in obs:
                bandas_resumen.append("100–400 HU")
            elif ">1000 HU" in obs:
                bandas_resumen.append(">1000 HU")
            elif "50–100 HU" in obs:
                bandas_resumen.append("50–100 HU")
            else:
                bandas_resumen.append(obs)
        lineas.append(f"- Se identifican focos en bandas de atenuación {' y '.join(bandas_resumen)}.")
    else:
        lineas.append("- No se identifican focos relevantes en bandas de atenuación.")

    lineas.append("- Hallazgos cuantitativos sin caracterización anatómica definitiva en esta etapa.")

    if analisis.get("advertencias_tecnicas"):
        for adv in analisis["advertencias_tecnicas"]:
            lineas.append(f"- Advertencia: {adv}")

    return "\n".join(lineas)
