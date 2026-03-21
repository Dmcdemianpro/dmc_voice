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


# Rangos de Unidades Hounsfield por tipo de tejido (TC)
HU_RANGES_TC = {
    "aire":           (-1000, -700),
    "pulmon":         (-700,  -200),
    "grasa":          (-200,  -10),
    "agua_tejidos":   (-10,   80),
    "tejido_blando":  (20,    80),
    "sangre_aguda":   (50,    100),
    "calcificacion":  (100,   400),
    "hueso_cortical": (400,   1000),
    "metal":          (1000,  3000),
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

    hallazgos_automaticos = []
    if distribucion["calcificacion"]["porcentaje"] > 2.0:
        hallazgos_automaticos.append(
            f"Calcificaciones presentes ({distribucion['calcificacion']['porcentaje']}% del volumen)"
        )
    if distribucion["metal"]["porcentaje"] > 0.1:
        hallazgos_automaticos.append("Material metálico detectado (implante o contraste denso)")
    if distribucion["sangre_aguda"]["porcentaje"] > 1.5:
        hallazgos_automaticos.append(
            f"Densidades compatibles con sangre aguda ({distribucion['sangre_aguda']['porcentaje']}%)"
        )
    if distribucion["aire"]["porcentaje"] > 60:
        hallazgos_automaticos.append("Alta proporción de aire — confirmar región torácica")

    return {
        "tipo": "TC_Hounsfield",
        "estadisticas_globales": {
            "hu_min":   round(float(hu_array.min()), 1),
            "hu_max":   round(float(hu_array.max()), 1),
            "hu_media": round(float(hu_array.mean()), 1),
            "hu_desv":  round(float(hu_array.std()), 1),
        },
        "distribucion_tejidos": distribucion,
        "hallazgos_automaticos": hallazgos_automaticos,
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

    hallazgos_automaticos = []
    if pct_anecoico > 5:
        hallazgos_automaticos.append(
            f"Zonas anecoicas presentes ({pct_anecoico}%) — posible componente quístico o líquido"
        )
    if pct_hiperecoico > 20:
        hallazgos_automaticos.append(
            f"Alta ecogenicidad ({pct_hiperecoico}%) — considerar grasa, cálculos o gas"
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
        "hallazgos_automaticos": hallazgos_automaticos,
    }


def _analizar_rx(ds, pixel_array: np.ndarray) -> dict:
    total = pixel_array.size
    p5, p95 = np.percentile(pixel_array, [5, 95])

    pct_hiperluente = round(float((pixel_array < p5).sum() / total * 100), 2)
    pct_radioopaco = round(float((pixel_array > p95).sum() / total * 100), 2)

    hallazgos_automaticos = []
    if pct_radioopaco > 15:
        hallazgos_automaticos.append(
            f"Alta densidad radiológica ({pct_radioopaco}%) — posible consolidación, derrame o calcificación"
        )
    if pct_hiperluente > 30:
        hallazgos_automaticos.append(
            f"Alta hiperlucencia ({pct_hiperluente}%) — confirmar hiperinsuflación o neumotórax"
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
        "hallazgos_automaticos": hallazgos_automaticos,
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

    hallazgos_automaticos = []
    if distribucion["calcificacion"]["porcentaje"] > 2.0:
        hallazgos_automaticos.append(
            f"Calcificaciones presentes ({distribucion['calcificacion']['porcentaje']}% del volumen)"
        )
    if distribucion["metal"]["porcentaje"] > 0.1:
        hallazgos_automaticos.append("Material metálico detectado (implante o contraste denso)")
    if distribucion["sangre_aguda"]["porcentaje"] > 1.5:
        hallazgos_automaticos.append(
            f"Densidades compatibles con sangre aguda ({distribucion['sangre_aguda']['porcentaje']}%)"
        )
    if distribucion["aire"]["porcentaje"] > 60:
        hallazgos_automaticos.append("Alta proporción de aire — confirmar región torácica")

    return {
        "tipo": "TC_Hounsfield",
        "estadisticas_globales": {
            "hu_min":   round(float(hu_combined.min()), 1),
            "hu_max":   round(float(hu_combined.max()), 1),
            "hu_media": round(float(hu_combined.mean()), 1),
            "hu_desv":  round(float(hu_combined.std()), 1),
        },
        "distribucion_tejidos": distribucion,
        "hallazgos_automaticos": hallazgos_automaticos,
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


def construir_contexto_para_claude(analisis: dict) -> str:
    """
    Convierte el análisis DICOM en texto estructurado para enviar a Claude API.
    Solo texto, sin imágenes, sin datos del paciente.
    """
    meta = analisis["metadata_tecnica"]
    cuant = analisis["analisis_cuantitativo"]
    modalidad = analisis["modalidad"]

    n_analizados = analisis.get("n_cortes_analizados")
    n_total = analisis.get("n_cortes_total")

    lineas = [
        "=== DATOS TÉCNICOS DEL ESTUDIO (extraídos del DICOM) ===",
        f"Modalidad: {meta['modalidad']}",
        f"Descripción: {meta['descripcion_estudio']} / {meta['descripcion_serie']}",
        f"Región anatómica: {meta['parte_del_cuerpo']}",
        f"Grosor de corte: {meta['grosor_corte_mm']} mm",
        f"Espaciado de píxeles: {meta['espaciado_pixeles']}",
        f"Contraste: {meta['contraste']} ({meta['ruta_contraste']})",
        f"N° de cortes: {meta['n_cortes']}",
        f"Equipo: {meta['fabricante']} {meta['modelo_equipo']}",
    ]

    if n_analizados and n_total:
        if n_analizados < n_total:
            lineas.append(f"Análisis basado en {n_analizados} de {n_total} cortes (muestreo equidistante)")
        else:
            lineas.append(f"Análisis basado en {n_analizados} cortes (serie completa)")

    if modalidad in ("CT", "TC") and cuant:
        lineas += [
            "",
            "=== ANÁLISIS CUANTITATIVO DE DENSIDADES (Unidades Hounsfield) ===",
            f"HU promedio global: {cuant['estadisticas_globales']['hu_media']}",
            f"Rango HU: {cuant['estadisticas_globales']['hu_min']} a {cuant['estadisticas_globales']['hu_max']}",
        ]
        dist = cuant["distribucion_tejidos"]
        for tejido, datos in dist.items():
            if datos["porcentaje"] > 0.5:
                lineas.append(
                    f"  {tejido.capitalize()}: {datos['porcentaje']}%"
                    + (f" (HU media: {datos['hu_media']})" if datos["hu_media"] else "")
                )
        if cuant["hallazgos_automaticos"]:
            lineas += ["", "=== HALLAZGOS DETECTADOS AUTOMÁTICAMENTE ==="]
            for h in cuant["hallazgos_automaticos"]:
                lineas.append(f"  - {h}")

    elif modalidad in ("MR", "RM") and cuant:
        lineas += [
            "",
            "=== PARÁMETROS DE SECUENCIA RM ===",
            f"Campo magnético: {cuant['campo_magnetico_T']} T",
            f"Tipo de secuencia inferido: {cuant['tipo_secuencia_inferido']}",
            f"SNR estimado: {cuant['estadisticas_senal']['snr_estimado']}",
            f"Zonas hiperintensas: {cuant['zonas_hiperintensas_pct']}%",
            f"Zonas hipointensas: {cuant['zonas_hipointensas_pct']}%",
        ]
        for param, val in cuant["parametros_secuencia"].items():
            lineas.append(f"  {param}: {val}")

    elif modalidad in ("US", "ECO") and cuant:
        lineas += [
            "",
            "=== ANÁLISIS DE ECOGENICIDAD ===",
            f"Frecuencia transductor: {cuant['frecuencia_transductor']}",
            f"Zonas anecoicas: {cuant['distribucion']['pct_anecoico']}%",
            f"Zonas hipoecoicas: {cuant['distribucion']['pct_hipoecoico']}%",
            f"Zonas hiperecoicas: {cuant['distribucion']['pct_hiperecoico']}%",
        ]
        if cuant["hallazgos_automaticos"]:
            lineas += ["", "=== HALLAZGOS DETECTADOS AUTOMÁTICAMENTE ==="]
            for h in cuant["hallazgos_automaticos"]:
                lineas.append(f"  - {h}")

    elif modalidad in ("DX", "CR", "RX") and cuant:
        lineas += [
            "",
            "=== ANÁLISIS DE DENSIDADES RADIOLÓGICAS ===",
            f"kVp: {cuant['kvp']} / mAs: {cuant['mas']}",
            f"Hiperlucencia: {cuant['distribucion']['pct_hiperlucente']}%",
            f"Radiopacidad: {cuant['distribucion']['pct_radioopaco']}%",
        ]
        if cuant["hallazgos_automaticos"]:
            lineas += ["", "=== HALLAZGOS DETECTADOS AUTOMÁTICAMENTE ==="]
            for h in cuant["hallazgos_automaticos"]:
                lineas.append(f"  - {h}")

    if analisis["advertencias_tecnicas"]:
        lineas += ["", "=== ADVERTENCIAS TÉCNICAS ==="]
        for adv in analisis["advertencias_tecnicas"]:
            lineas.append(f"  ! {adv}")

    return "\n".join(lineas)
