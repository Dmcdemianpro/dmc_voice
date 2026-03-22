"""
Análisis anatómico local (sin IA) para TC de cerebro.

Enfoque: HU thresholding + heurísticas espaciales sobre arrays numpy.
NO deep learning. Debe completarse en < 2 segundos para 30 cortes 512x512.

Todas las funciones operan sobre arrays numpy de Unidades Hounsfield.
"""
import logging
import numpy as np
from scipy import ndimage
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constantes ────────────────────────────────────────────────────────────

BONE_HU_MIN = 400                # Límite hueso (cráneo)
CSF_HU_RANGE = (0, 15)           # Líquido cefalorraquídeo
BRAIN_HU_RANGE = (20, 45)        # Parénquima cerebral
INFRATENTORIAL_FRACTION = 0.30   # 30% inferior = fosa posterior
CENTRAL_FRACTION = 0.40          # 40% central = región ventricular
MIDLINE_SHIFT_THRESHOLD = 3.0    # mm, clínicamente relevante
ASYMMETRY_THRESHOLD = 0.15       # 15% diferencia L vs R
MIN_SLICES_FOR_ANALYSIS = 10
HIGH_ATTENUATION_THRESHOLD = 60  # HU, foco de alta atenuación (sangre aguda ~50-70+)
LOW_ATTENUATION_THRESHOLD = 15   # HU, foco de baja atenuación (isquemia aguda)


# ── Funciones internas ────────────────────────────────────────────────────

def _crear_mascara_intracraneal(hu_slice: np.ndarray) -> np.ndarray:
    """Crea máscara del espacio intracraneal.

    Estrategia: HU > BONE_HU_MIN = hueso → binary_fill_holes → interior = intracraneal.
    """
    mascara_hueso = hu_slice > BONE_HU_MIN
    # Fill holes inside the skull ring to get intracranial space
    filled = ndimage.binary_fill_holes(mascara_hueso)
    # Intracraneal = filled minus bone
    mascara = filled & ~mascara_hueso
    return mascara


def _detectar_linea_media(mascara: np.ndarray) -> Optional[int]:
    """Detecta la columna de la línea media como centroide de la máscara intracraneal.

    Returns:
        Columna del midline, o None si no se puede calcular.
    """
    if not mascara.any():
        return None
    # Centroid of the intracranial mask — column component
    coords = np.argwhere(mascara)
    midline_col = int(np.median(coords[:, 1]))
    return midline_col


def _separar_hemisferios(hu_slice: np.ndarray, mascara: np.ndarray,
                          midline_col: int) -> tuple[np.ndarray, np.ndarray]:
    """Separa hemisferios izquierdo y derecho del midline.

    Convención radiológica: izquierdo del paciente = derecho de imagen.
    En las imágenes DICOM estándar (vista axial desde inferior):
    - Columnas < midline = hemisferio derecho del paciente
    - Columnas >= midline = hemisferio izquierdo del paciente

    Returns:
        (mascara_derecho, mascara_izquierdo) del paciente
    """
    mascara_der = mascara.copy()
    mascara_izq = mascara.copy()
    mascara_der[:, midline_col:] = False
    mascara_izq[:, :midline_col] = False
    return mascara_der, mascara_izq


def _clasificar_supra_infra(n_slices: int) -> tuple[list[int], list[int]]:
    """Clasifica cortes en supratentorial (top 70%) e infratentorial (bottom 30%).

    Asume que los cortes están ordenados de inferior a superior (SliceLocation ascendente).

    Returns:
        (indices_supra, indices_infra)
    """
    corte_division = int(n_slices * INFRATENTORIAL_FRACTION)
    indices_infra = list(range(0, corte_division))
    indices_supra = list(range(corte_division, n_slices))
    return indices_supra, indices_infra


def _evaluar_sistema_ventricular(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
    midlines: list[Optional[int]],
) -> dict:
    """Evalúa el sistema ventricular basándose en CSF en zona central.

    Busca LCR (0-15 HU) en la franja central (40% de ancho) de cada corte.
    """
    if len(hu_slices) < MIN_SLICES_FOR_ANALYSIS:
        return {"estado": "no evaluable", "confianza": 0.0}

    csf_fracciones = []
    csf_asimetrias = []

    for hu_s, mask, mid in zip(hu_slices, mascaras, midlines):
        if not mask.any() or mid is None:
            continue
        rows, cols = hu_s.shape
        # Zona central: 40% alrededor del midline
        half_width = int(cols * CENTRAL_FRACTION / 2)
        col_start = max(0, mid - half_width)
        col_end = min(cols, mid + half_width)

        zona_central = mask.copy()
        zona_central[:, :col_start] = False
        zona_central[:, col_end:] = False

        if not zona_central.any():
            continue

        # Contar píxeles de LCR en zona central
        csf_mask = zona_central & (hu_s >= CSF_HU_RANGE[0]) & (hu_s <= CSF_HU_RANGE[1])
        frac = csf_mask.sum() / zona_central.sum()
        csf_fracciones.append(frac)

        # Asimetría L vs R del LCR ventricular
        csf_left = csf_mask[:, mid:].sum()
        csf_right = csf_mask[:, :mid].sum()
        total_csf = csf_left + csf_right
        if total_csf > 0:
            asim = abs(csf_left - csf_right) / total_csf
            csf_asimetrias.append(asim)

    if not csf_fracciones:
        return {"estado": "no evaluable", "confianza": 0.0}

    media_csf = float(np.mean(csf_fracciones))
    media_asim = float(np.mean(csf_asimetrias)) if csf_asimetrias else 0.0

    # Heurísticas:
    # CSF > 15% en zona central → dilatado
    # Asimetría > 30% → asimétrico
    # CSF 3-15% → normal
    # CSF < 3% → posible compresión, pero reportar normal
    if media_csf > 0.15:
        if media_asim > 0.30:
            return {"estado": "asimetrico", "confianza": 0.6}
        return {"estado": "dilatado", "confianza": 0.6}
    elif media_asim > 0.30 and media_csf > 0.03:
        return {"estado": "asimetrico", "confianza": 0.5}
    else:
        return {"estado": "normal", "confianza": 0.7}


def _evaluar_linea_media(
    midlines: list[Optional[int]],
    mascaras: list[np.ndarray],
    pixel_spacing: float,
) -> dict:
    """Evalúa desviación de línea media midiendo la diferencia entre
    el centroide de la máscara y el centro geométrico del cráneo.

    Returns:
        dict con estado y desviación en mm.
    """
    desviaciones_px = []

    for mask, mid in zip(mascaras, midlines):
        if not mask.any() or mid is None:
            continue
        # Centro geométrico del cráneo (min/max columna de la máscara)
        cols_activas = np.where(mask.any(axis=0))[0]
        if len(cols_activas) < 10:
            continue
        centro_geometrico = (cols_activas[0] + cols_activas[-1]) / 2
        desviacion = mid - centro_geometrico
        desviaciones_px.append(desviacion)

    if not desviaciones_px:
        return {"estado": "no evaluable", "desviacion_mm": 0.0}

    media_desv = float(np.mean(desviaciones_px))
    desv_mm = abs(media_desv) * pixel_spacing

    if desv_mm < MIDLINE_SHIFT_THRESHOLD:
        return {"estado": "centrada", "desviacion_mm": round(desv_mm, 1)}
    elif media_desv > 0:
        return {"estado": "desviada_izquierda", "desviacion_mm": round(desv_mm, 1)}
    else:
        return {"estado": "desviada_derecha", "desviacion_mm": round(desv_mm, 1)}


def _evaluar_calota(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
) -> dict:
    """Evalúa la integridad de la calota ósea.

    Verifica la continuidad del anillo óseo (HU > 400) en cada corte.
    """
    if not hu_slices:
        return {"estado": "no evaluable"}

    interrupciones = 0
    evaluados = 0

    for hu_s, mask in zip(hu_slices, mascaras):
        if not mask.any():
            continue
        evaluados += 1

        # Máscara de hueso
        mascara_hueso = hu_s > BONE_HU_MIN
        if not mascara_hueso.any():
            interrupciones += 1
            continue

        # Labeled regions of bone — si hay >1 componente grande, puede haber interrupción
        labeled, n_features = ndimage.label(mascara_hueso)
        if n_features == 0:
            interrupciones += 1
            continue

        # Verificar que el anillo es continuo: el componente más grande
        # debe representar >70% del hueso total
        component_sizes = ndimage.sum(mascara_hueso, labeled, range(1, n_features + 1))
        if len(component_sizes) > 0:
            max_component = max(component_sizes)
            total_bone = mascara_hueso.sum()
            if total_bone > 0 and max_component / total_bone < 0.70:
                interrupciones += 1

    if evaluados == 0:
        return {"estado": "no evaluable"}
    if interrupciones > evaluados * 0.2:
        return {"estado": "hallazgos"}
    return {"estado": "integra"}


def _evaluar_parenquima(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
    indices_supra: list[int],
) -> dict:
    """Evalúa parénquima supratentorial: densidad media del cerebro.

    Parénquima normal: 20-45 HU.
    """
    hu_values = []
    for i in indices_supra:
        if i >= len(hu_slices):
            continue
        hu_s = hu_slices[i]
        mask = mascaras[i]
        if not mask.any():
            continue
        # Parénquima: dentro de máscara, HU entre -10 y 80 (excluir aire y hueso)
        parenquima_mask = mask & (hu_s > -10) & (hu_s < 80)
        if parenquima_mask.any():
            hu_values.extend(hu_s[parenquima_mask].tolist())

    if not hu_values:
        return {"descripcion": "no evaluable", "hu_media": 0.0}

    hu_media = float(np.mean(hu_values))
    if BRAIN_HU_RANGE[0] <= hu_media <= BRAIN_HU_RANGE[1]:
        return {"descripcion": "densidad conservada", "hu_media": round(hu_media, 1)}
    elif hu_media < BRAIN_HU_RANGE[0]:
        return {"descripcion": "densidad difusamente disminuida", "hu_media": round(hu_media, 1)}
    else:
        return {"descripcion": "densidad difusamente aumentada", "hu_media": round(hu_media, 1)}


def _evaluar_fosa_posterior(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
    indices_infra: list[int],
) -> dict:
    """Evaluación infratentorial básica."""
    hu_values = []
    for i in indices_infra:
        if i >= len(hu_slices):
            continue
        hu_s = hu_slices[i]
        mask = mascaras[i]
        if not mask.any():
            continue
        parenquima_mask = mask & (hu_s > -10) & (hu_s < 80)
        if parenquima_mask.any():
            hu_values.extend(hu_s[parenquima_mask].tolist())

    if not hu_values:
        return {"descripcion": "no evaluable"}

    hu_media = float(np.mean(hu_values))
    if BRAIN_HU_RANGE[0] <= hu_media <= BRAIN_HU_RANGE[1]:
        return {"descripcion": "sin hallazgos relevantes"}
    else:
        return {"descripcion": "densidad alterada en fosa posterior"}


def _detectar_asimetrias(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
    midlines: list[Optional[int]],
) -> list[dict]:
    """Compara distribuciones HU entre hemisferio izquierdo y derecho.

    Retorna lista de asimetrías significativas (>15% diferencia).
    """
    asimetrias = []
    asim_por_nivel = {"supra": [], "infra": []}
    n_slices = len(hu_slices)
    indices_supra, indices_infra = _clasificar_supra_infra(n_slices)

    for i, (hu_s, mask, mid) in enumerate(zip(hu_slices, mascaras, midlines)):
        if not mask.any() or mid is None:
            continue
        mask_der, mask_izq = _separar_hemisferios(hu_s, mask, mid)

        # Filtrar a parénquima
        paren_der = mask_der & (hu_s > -10) & (hu_s < 80)
        paren_izq = mask_izq & (hu_s > -10) & (hu_s < 80)

        if not paren_der.any() or not paren_izq.any():
            continue

        media_der = float(hu_s[paren_der].mean())
        media_izq = float(hu_s[paren_izq].mean())
        media_total = (media_der + media_izq) / 2
        if media_total == 0:
            continue

        diff_rel = abs(media_der - media_izq) / media_total
        nivel = "supratentorial" if i in indices_supra else "infratentorial"

        if diff_rel > ASYMMETRY_THRESHOLD:
            if nivel == "supratentorial":
                asim_por_nivel["supra"].append(diff_rel)
            else:
                asim_por_nivel["infra"].append(diff_rel)

    # Consolidar asimetrías significativas
    if asim_por_nivel["supra"]:
        media_supra = float(np.mean(asim_por_nivel["supra"]))
        lateralidad = "derecho" if media_supra > 0 else "izquierdo"
        asimetrias.append({
            "region": "supratentorial",
            "lateralidad": lateralidad,
            "magnitud": f"{media_supra:.1%}",
        })
    if asim_por_nivel["infra"]:
        media_infra = float(np.mean(asim_por_nivel["infra"]))
        asimetrias.append({
            "region": "infratentorial",
            "lateralidad": "indeterminada",
            "magnitud": f"{media_infra:.1%}",
        })

    return asimetrias


def _localizar_focos(
    hu_slices: list[np.ndarray],
    mascaras: list[np.ndarray],
    midlines: list[Optional[int]],
    indices_supra: list[int],
    indices_infra: list[int],
) -> list[dict]:
    """Localiza focos de alta/baja atenuación con ubicación L/R + supra/infra.

    Alta atenuación (>60 HU): posible sangre aguda, calcificación
    Baja atenuación (<15 HU dentro de parénquima): posible edema, isquemia
    """
    focos = []

    for i, (hu_s, mask, mid) in enumerate(zip(hu_slices, mascaras, midlines)):
        if not mask.any() or mid is None:
            continue

        region = "supratentorial" if i in indices_supra else "infratentorial"

        # Focos de alta atenuación (dentro de máscara intracraneal, no hueso)
        high_mask = mask & (hu_s > HIGH_ATTENUATION_THRESHOLD) & (hu_s <= BONE_HU_MIN)
        if high_mask.sum() > 20:  # Umbral mínimo de píxeles para considerar foco
            coords = np.argwhere(high_mask)
            center_col = int(np.mean(coords[:, 1]))
            lateralidad = "derecho" if center_col < mid else "izquierdo"
            focos.append({
                "tipo": "alta_atenuacion",
                "lateralidad": lateralidad,
                "region": region,
                "posicion": f"corte {i+1}/{len(hu_slices)}",
            })

        # Focos de baja atenuación (dentro de parénquima esperado)
        paren_mask = mask & (hu_s > -10) & (hu_s < 80)
        low_mask = paren_mask & (hu_s < LOW_ATTENUATION_THRESHOLD)
        paren_total = paren_mask.sum()
        if paren_total > 0 and low_mask.sum() > paren_total * 0.05:
            coords = np.argwhere(low_mask)
            center_col = int(np.mean(coords[:, 1]))
            lateralidad = "derecho" if center_col < mid else "izquierdo"
            focos.append({
                "tipo": "baja_atenuacion",
                "lateralidad": lateralidad,
                "region": region,
                "posicion": f"corte {i+1}/{len(hu_slices)}",
            })

    # Consolidar focos (agrupar por tipo/lateralidad/region, eliminar duplicados)
    consolidados = {}
    for foco in focos:
        key = (foco["tipo"], foco["lateralidad"], foco["region"])
        if key not in consolidados:
            consolidados[key] = foco
    return list(consolidados.values())


# ── Función pública orquestadora ──────────────────────────────────────────

def analizar_anatomia_tc_cerebro(
    pixel_arrays_with_ds: list[tuple],
    pixel_spacing: float = 0.5,
) -> dict:
    """Análisis anatómico aproximado de TC de cerebro.

    Args:
        pixel_arrays_with_ds: lista de (ds, pixel_array) — pydicom dataset + array float.
            El pixel_array debe estar en Unidades Hounsfield (ya con RescaleSlope/Intercept).
        pixel_spacing: espaciado de píxeles en mm (para convertir desviación a mm).

    Returns:
        dict con análisis anatómico estructurado.
    """
    if len(pixel_arrays_with_ds) < MIN_SLICES_FOR_ANALYSIS:
        return {
            "sistema_ventricular": {"estado": "no evaluable", "confianza": 0.0},
            "linea_media": {"estado": "no evaluable", "desviacion_mm": 0.0},
            "calota": {"estado": "no evaluable"},
            "fosa_posterior": {"descripcion": "no evaluable"},
            "parenquima_supratentorial": {"descripcion": "no evaluable", "hu_media": 0.0},
            "asimetrias": [],
            "focos_atenuacion": [],
            "confianza_anatomica": "baja",
            "limitaciones": [f"Insuficientes cortes para análisis anatómico ({len(pixel_arrays_with_ds)}/{MIN_SLICES_FOR_ANALYSIS})"],
            "slices_evaluables": len(pixel_arrays_with_ds),
        }

    # Convertir a HU si no lo están ya
    hu_slices = []
    for ds, pixel_array in pixel_arrays_with_ds:
        slope = float(getattr(ds, "RescaleSlope", 1))
        intercept = float(getattr(ds, "RescaleIntercept", -1024))
        hu = pixel_array * slope + intercept
        hu_slices.append(hu)

    # Extraer pixel_spacing del primer dataset si disponible
    ds0 = pixel_arrays_with_ds[0][0]
    ps = getattr(ds0, "PixelSpacing", None)
    if ps is not None:
        try:
            pixel_spacing = float(ps[0])
        except (TypeError, IndexError):
            pass

    # Crear máscaras intracraneal y detectar midline por corte
    mascaras = [_crear_mascara_intracraneal(hu_s) for hu_s in hu_slices]
    midlines = [_detectar_linea_media(mask) for mask in mascaras]

    # Clasificar cortes supra/infratentorial
    indices_supra, indices_infra = _clasificar_supra_infra(len(hu_slices))

    # Evaluar cada componente anatómico
    sistema_ventricular = _evaluar_sistema_ventricular(hu_slices, mascaras, midlines)
    linea_media = _evaluar_linea_media(midlines, mascaras, pixel_spacing)
    calota = _evaluar_calota(hu_slices, mascaras)
    parenquima = _evaluar_parenquima(hu_slices, mascaras, indices_supra)
    fosa_posterior = _evaluar_fosa_posterior(hu_slices, mascaras, indices_infra)
    asimetrias = _detectar_asimetrias(hu_slices, mascaras, midlines)
    focos = _localizar_focos(hu_slices, mascaras, midlines, indices_supra, indices_infra)

    # Determinar confianza anatómica global
    limitaciones = []
    slices_con_mascara = sum(1 for m in mascaras if m.any())
    if slices_con_mascara < len(hu_slices) * 0.5:
        limitaciones.append("Menos del 50% de cortes con máscara intracraneal válida")

    midlines_validos = sum(1 for m in midlines if m is not None)
    if midlines_validos < len(hu_slices) * 0.5:
        limitaciones.append("Línea media no detectable en la mayoría de cortes")

    if sistema_ventricular["estado"] == "no evaluable":
        limitaciones.append("Sistema ventricular no evaluable")

    if len(limitaciones) == 0:
        confianza = "alta"
    elif len(limitaciones) == 1:
        confianza = "media"
    else:
        confianza = "baja"

    limitaciones.append("Análisis aproximado por heurísticas, requiere validación con revisión directa de imágenes.")

    return {
        "sistema_ventricular": sistema_ventricular,
        "linea_media": linea_media,
        "calota": calota,
        "fosa_posterior": fosa_posterior,
        "parenquima_supratentorial": parenquima,
        "asimetrias": asimetrias,
        "focos_atenuacion": focos,
        "confianza_anatomica": confianza,
        "limitaciones": limitaciones,
        "slices_evaluables": slices_con_mascara,
    }
