#!/usr/bin/env python3
"""
Evaluación de informes del pipeline contra informes de referencia de radiólogos.

Uso:
    python scripts/evaluate_reports.py --cases-dir evaluation/cases
    python scripts/evaluate_reports.py --cases-dir evaluation/cases --verbose
    python scripts/evaluate_reports.py --cases-dir evaluation/cases --modality TC --region Cerebro
    python scripts/evaluate_reports.py --cases-dir evaluation/cases --output resultados.json
"""
import argparse
import json
import os
import sys
import unicodedata
from typing import Optional

# Add backend root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Sinónimos clínicos para comparación flexible ──────────────────────────

SINONIMOS: list[set[str]] = [
    {"hematoma", "hemorragia intraparenquimatosa", "sangrado agudo", "hemorragia aguda"},
    {"hipodensidad", "baja atenuacion", "area hipodensa", "zona hipodensa"},
    {"hiperdensidad", "alta atenuacion", "area hiperdensa", "zona hiperdensa"},
    {"infarto", "isquemia", "lesion isquemica", "acv isquemico"},
    {"efecto de masa", "efecto masa", "compresion"},
    {"desviacion linea media", "desplazamiento linea media", "shift linea media"},
    {"sistema ventricular", "ventriculos", "ventricular"},
    {"sin alteraciones", "sin hallazgos", "normal", "sin lesiones", "sin patologia"},
    {"calota integra", "calota sin fracturas", "calota sin alteraciones"},
    {"fosa posterior sin lesiones", "fosa posterior sin alteraciones", "fosa posterior normal"},
    {"extension intraventricular", "sangrado intraventricular", "hemorragia intraventricular"},
]


def _strip_accents(s: str) -> str:
    """Remove diacritical marks."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _normalize(text: str) -> str:
    """Normaliza texto para comparación: minúsculas, sin acentos."""
    return _strip_accents(text.strip().lower())


def _son_sinonimos(a: str, b: str) -> bool:
    """Verifica si dos términos son sinónimos clínicos."""
    na, nb = _normalize(a), _normalize(b)
    if na == nb:
        return True
    for grupo in SINONIMOS:
        grupo_norm = {_normalize(s) for s in grupo}
        if na in grupo_norm and nb in grupo_norm:
            return True
    return False


def _contiene_termino(texto: str, termino: str) -> bool:
    """Verifica si el texto contiene el término o un sinónimo."""
    texto_norm = _normalize(texto)
    termino_norm = _normalize(termino)
    if termino_norm in texto_norm:
        return True
    for grupo in SINONIMOS:
        grupo_norm = {_normalize(s) for s in grupo}
        if termino_norm in grupo_norm:
            for sin in grupo_norm:
                if sin in texto_norm:
                    return True
    return False


# ── Evaluación de un caso ─────────────────────────────────────────────────

def evaluar_caso(referencia: dict, pipeline_output: dict) -> dict:
    """Evalúa un caso individual: concordancia, errores, omisiones.

    Args:
        referencia: dict con los campos del radiólogo (ground truth)
        pipeline_output: dict con los campos generados por el pipeline

    Returns:
        dict con métricas de evaluación del caso
    """
    errores_mayores, errores_menores = _clasificar_errores(referencia, pipeline_output)

    # Concordancia de categoría
    cat_ref = _normalize(referencia.get("categoria", ""))
    cat_pipe = _normalize(pipeline_output.get("categoria", ""))
    categoria_correcta = cat_ref == cat_pipe

    # Concordancia de hallazgo principal
    hallazgo_ref = referencia.get("hallazgo_principal", "")
    hallazgo_pipe = ""
    findings = pipeline_output.get("findings_json", {})
    if findings:
        hallazgo_pipe = findings.get("descripcion_hallazgo", findings.get("hallazgo_principal", ""))
    hallazgo_concordante = _son_sinonimos(hallazgo_ref, hallazgo_pipe) if hallazgo_ref and hallazgo_pipe else False

    # Concordancia de lateralidad
    lat_ref = _normalize(referencia.get("lateralidad", ""))
    lat_pipe = _normalize(findings.get("lateralidad", "")) if findings else ""
    lateralidad_correcta = lat_ref == lat_pipe if lat_ref and lat_pipe else None

    # Cobertura de negativos importantes
    negativos_ref = referencia.get("negativos_importantes", [])
    informe_pipe = pipeline_output.get("informe_texto", "")
    negativos_cubiertos = []
    negativos_omitidos = []
    for neg in negativos_ref:
        if _contiene_termino(informe_pipe, neg):
            negativos_cubiertos.append(neg)
        else:
            negativos_omitidos.append(neg)

    # Hallazgos secundarios
    sec_ref = referencia.get("hallazgos_secundarios", [])
    sec_cubiertos = []
    sec_omitidos = []
    for sec in sec_ref:
        if _contiene_termino(informe_pipe, sec):
            sec_cubiertos.append(sec)
        else:
            sec_omitidos.append(sec)

    # Sobreinterpretación: hallazgos en pipeline no presentes en referencia
    sobreinterpretaciones = _detectar_sobreinterpretaciones(referencia, pipeline_output)

    return {
        "categoria_correcta": categoria_correcta,
        "hallazgo_concordante": hallazgo_concordante,
        "lateralidad_correcta": lateralidad_correcta,
        "negativos_cubiertos": negativos_cubiertos,
        "negativos_omitidos": negativos_omitidos,
        "cobertura_negativos": len(negativos_cubiertos) / len(negativos_ref) if negativos_ref else 1.0,
        "secundarios_cubiertos": sec_cubiertos,
        "secundarios_omitidos": sec_omitidos,
        "sobreinterpretaciones": sobreinterpretaciones,
        "errores_mayores": errores_mayores,
        "errores_menores": errores_menores,
        "score": _calcular_score(
            categoria_correcta, hallazgo_concordante,
            lateralidad_correcta, errores_mayores, errores_menores,
        ),
    }


def _clasificar_errores(referencia: dict, pipeline_output: dict) -> tuple[list, list]:
    """Separa errores mayores (diagnóstico) de menores (estilo).

    Errores mayores:
    - Categoría incorrecta
    - Lateralidad incorrecta
    - Hemorragia inventada (pipeline dice hemorrágico, referencia no)
    - Omisión del hallazgo principal

    Errores menores:
    - Estilo diferente
    - Hallazgo secundario extra/faltante
    - Formato diferente
    """
    errores_mayores = []
    errores_menores = []

    cat_ref = _normalize(referencia.get("categoria", ""))
    cat_pipe = _normalize(pipeline_output.get("categoria", ""))

    # Error mayor: categoría incorrecta
    if cat_ref and cat_pipe and cat_ref != cat_pipe:
        errores_mayores.append(f"Categoría incorrecta: referencia='{cat_ref}', pipeline='{cat_pipe}'")

    # Error mayor: lateralidad incorrecta
    findings = pipeline_output.get("findings_json", {})
    lat_ref = _normalize(referencia.get("lateralidad", ""))
    lat_pipe = _normalize(findings.get("lateralidad", "")) if findings else ""
    if lat_ref and lat_pipe and lat_ref != lat_pipe and lat_pipe != "no descrito":
        errores_mayores.append(f"Lateralidad incorrecta: referencia='{lat_ref}', pipeline='{lat_pipe}'")

    # Error mayor: hemorragia inventada
    if cat_ref != "hemorragico" and cat_pipe == "hemorragico":
        errores_mayores.append("Sobrediagnóstico: pipeline clasificó como hemorrágico sin serlo")

    # Error mayor: isquemia inventada
    if cat_ref != "isquemico" and cat_pipe == "isquemico":
        errores_mayores.append("Sobrediagnóstico: pipeline clasificó como isquémico sin serlo")

    # Error mayor: omisión del hallazgo principal
    hallazgo_ref = referencia.get("hallazgo_principal", "")
    informe_pipe = pipeline_output.get("informe_texto", "")
    if hallazgo_ref and informe_pipe and not _contiene_termino(informe_pipe, hallazgo_ref):
        errores_mayores.append(f"Omisión del hallazgo principal: '{hallazgo_ref}' no mencionado en informe")

    # Error menor: hallazgos secundarios omitidos
    for sec in referencia.get("hallazgos_secundarios", []):
        if informe_pipe and not _contiene_termino(informe_pipe, sec):
            errores_menores.append(f"Hallazgo secundario omitido: '{sec}'")

    return errores_mayores, errores_menores


def _detectar_sobreinterpretaciones(referencia: dict, pipeline_output: dict) -> list[str]:
    """Detecta hallazgos en el pipeline que no están en la referencia."""
    sobreinterp = []
    informe_ref = _normalize(referencia.get("informe_texto", ""))
    informe_pipe = _normalize(pipeline_output.get("informe_texto", ""))

    # Términos patológicos que no deberían aparecer si no están en la referencia
    terminos_criticos = [
        "hematoma", "hemorragia", "sangrado", "isquemia", "infarto",
        "fractura", "herniacion", "hidrocefalia",
    ]
    for term in terminos_criticos:
        if term in informe_pipe and term not in informe_ref:
            sobreinterp.append(f"Término '{term}' en pipeline pero no en referencia")

    return sobreinterp


def _calcular_score(
    cat_ok: bool,
    hallazgo_ok: bool,
    lat_ok: Optional[bool],
    errores_mayores: list,
    errores_menores: list,
) -> float:
    """Score 0-100 ponderado."""
    score = 0.0
    # Categoría correcta: 40 puntos
    if cat_ok:
        score += 40.0
    # Hallazgo concordante: 25 puntos
    if hallazgo_ok:
        score += 25.0
    # Lateralidad correcta: 15 puntos
    if lat_ok is True:
        score += 15.0
    elif lat_ok is None:
        score += 15.0  # N/A → no penalizar
    # Penalización por errores mayores: -15 cada uno (max -30)
    score -= min(len(errores_mayores) * 15.0, 30.0)
    # Penalización por errores menores: -5 cada uno (max -10)
    score -= min(len(errores_menores) * 5.0, 10.0)
    return max(0.0, min(100.0, score))


# ── Métricas agregadas ────────────────────────────────────────────────────

def calcular_metricas_agregadas(evaluaciones: list[dict]) -> dict:
    """Calcula métricas agregadas sobre una lista de evaluaciones.

    Returns:
        dict con accuracy, tasas de error, métricas por categoría.
    """
    if not evaluaciones:
        return {"n_casos": 0}

    n = len(evaluaciones)
    cat_correctas = sum(1 for e in evaluaciones if e["categoria_correcta"])
    hallazgo_ok = sum(1 for e in evaluaciones if e["hallazgo_concordante"])
    lat_evaluables = [e for e in evaluaciones if e["lateralidad_correcta"] is not None]
    lat_correctas = sum(1 for e in lat_evaluables if e["lateralidad_correcta"])

    total_mayores = sum(len(e["errores_mayores"]) for e in evaluaciones)
    total_menores = sum(len(e["errores_menores"]) for e in evaluaciones)
    total_sobreinterp = sum(len(e["sobreinterpretaciones"]) for e in evaluaciones)

    scores = [e["score"] for e in evaluaciones]
    cobertura_neg = [e["cobertura_negativos"] for e in evaluaciones]

    return {
        "n_casos": n,
        "accuracy_categoria": round(cat_correctas / n, 3),
        "accuracy_hallazgo": round(hallazgo_ok / n, 3),
        "accuracy_lateralidad": round(lat_correctas / len(lat_evaluables), 3) if lat_evaluables else None,
        "cobertura_negativos_media": round(sum(cobertura_neg) / n, 3),
        "tasa_errores_mayores": round(total_mayores / n, 3),
        "tasa_errores_menores": round(total_menores / n, 3),
        "tasa_sobreinterpretacion": round(total_sobreinterp / n, 3),
        "score_medio": round(sum(scores) / n, 1),
        "score_min": round(min(scores), 1),
        "score_max": round(max(scores), 1),
    }


# ── CLI ───────────────────────────────────────────────────────────────────

def cargar_casos(cases_dir: str, modality: Optional[str] = None, region: Optional[str] = None) -> list[dict]:
    """Carga casos JSON desde un directorio, opcionalmente filtrados."""
    casos = []
    for fname in sorted(os.listdir(cases_dir)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(cases_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            caso = json.load(f)
        if modality and _normalize(caso.get("modalidad", "")) != _normalize(modality):
            continue
        if region and _normalize(caso.get("region", "")) != _normalize(region):
            continue
        casos.append(caso)
    return casos


def main():
    parser = argparse.ArgumentParser(description="Evaluar informes del pipeline contra referencia")
    parser.add_argument("--cases-dir", required=True, help="Directorio con casos JSON")
    parser.add_argument("--output", help="Archivo de salida JSON (opcional)")
    parser.add_argument("--modality", help="Filtrar por modalidad")
    parser.add_argument("--region", help="Filtrar por región")
    parser.add_argument("--verbose", action="store_true", help="Mostrar detalle por caso")
    args = parser.parse_args()

    if not os.path.isdir(args.cases_dir):
        print(f"Error: directorio '{args.cases_dir}' no existe")
        sys.exit(1)

    casos = cargar_casos(args.cases_dir, args.modality, args.region)
    if not casos:
        print("No se encontraron casos")
        sys.exit(1)

    print(f"\nEvaluando {len(casos)} caso(s)...\n")

    evaluaciones = []
    for caso in casos:
        case_id = caso.get("case_id", "?")
        ev = evaluar_caso(caso["referencia"], caso["pipeline_output"])
        ev["case_id"] = case_id
        evaluaciones.append(ev)

        if args.verbose:
            status = "OK" if ev["categoria_correcta"] and not ev["errores_mayores"] else "ISSUE"
            print(f"  [{status}] {case_id}: score={ev['score']:.0f}, "
                  f"cat={'OK' if ev['categoria_correcta'] else 'FAIL'}, "
                  f"mayores={len(ev['errores_mayores'])}, menores={len(ev['errores_menores'])}")
            if ev["errores_mayores"]:
                for e in ev["errores_mayores"]:
                    print(f"       MAYOR: {e}")
            if ev["errores_menores"]:
                for e in ev["errores_menores"]:
                    print(f"       menor: {e}")
            if ev["sobreinterpretaciones"]:
                for s in ev["sobreinterpretaciones"]:
                    print(f"       sobreinterp: {s}")

    metricas = calcular_metricas_agregadas(evaluaciones)

    print(f"\n{'='*60}")
    print(f"RESULTADOS ({metricas['n_casos']} casos)")
    print(f"{'='*60}")
    print(f"  Accuracy categoría:    {metricas['accuracy_categoria']:.1%}")
    print(f"  Accuracy hallazgo:     {metricas['accuracy_hallazgo']:.1%}")
    if metricas['accuracy_lateralidad'] is not None:
        print(f"  Accuracy lateralidad:  {metricas['accuracy_lateralidad']:.1%}")
    print(f"  Cobertura negativos:   {metricas['cobertura_negativos_media']:.1%}")
    print(f"  Errores mayores/caso:  {metricas['tasa_errores_mayores']:.2f}")
    print(f"  Errores menores/caso:  {metricas['tasa_errores_menores']:.2f}")
    print(f"  Score medio:           {metricas['score_medio']:.0f}/100")
    print(f"  Score rango:           [{metricas['score_min']:.0f}, {metricas['score_max']:.0f}]")
    print(f"{'='*60}")

    if args.output:
        resultado = {
            "metricas": metricas,
            "evaluaciones": evaluaciones,
        }
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print(f"\nResultados guardados en {args.output}")


if __name__ == "__main__":
    main()
