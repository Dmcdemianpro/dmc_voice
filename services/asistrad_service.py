"""
Servicio AsistRad — Pipeline de 3 pasos para generación de pre-informes radiológicos.

Paso 1: Extracción — Contexto DICOM → JSON estructurado (Claude call 1)
Paso 2: Clasificación — JSON → categoría (función pura, sin IA)
Paso 3: Redacción — JSON + plantilla de categoría → informe final (Claude call 2)

Jerarquía: hallazgo observado > contexto extraído > JSON > plantilla > redacción

Para modalidades sin schema de extracción, se usa el pipeline legacy (1 paso).
"""
import anthropic
import json
import logging
import unicodedata
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from config import settings
from models.asistrad import RadTemplate, RadReportHistory
from services.clasificacion_registry import classify_for_modality
from services.schemas_extraccion import (
    EXTRACTION_SCHEMAS as _MODULAR_EXTRACTION_SCHEMAS,
    has_extraction_schema as _modular_has_extraction_schema,
    get_extraction_schema as _modular_get_extraction_schema,
)
from services.plantillas_categoria import (
    CATEGORY_TEMPLATES as _MODULAR_CATEGORY_TEMPLATES,
    get_category_template as _modular_get_category_template,
)
# Trigger auto-registration of classifiers
import services.clasificadores  # noqa: F401

logger = logging.getLogger(__name__)

_client: Optional[anthropic.AsyncAnthropic] = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


# ── Modalidades y Regiones disponibles ──────────────────────────────────────

MODALITIES = {
    "RX": "Radiografía",
    "TC": "Tomografía Computada",
    "RM": "Resonancia Magnética",
    "ECO": "Ecografía / Ultrasonido",
    "MAMOGRAFIA": "Mamografía",
    "PET-CT": "PET-CT",
    "FLUOROSCOPIA": "Fluoroscopía",
    "DENSITOMETRIA": "Densitometría Ósea",
    "ANGIOGRAFIA": "Angiografía",
    "MEDICINA_NUCLEAR": "Medicina Nuclear",
}

REGIONS_BY_MODALITY = {
    "RX": ["Tórax", "Abdomen", "Columna Cervical", "Columna Dorsal", "Columna Lumbar",
            "Pelvis", "Cadera", "Rodilla", "Tobillo", "Pie", "Hombro", "Codo",
            "Muñeca", "Mano", "Cráneo", "Senos Paranasales"],
    "TC": ["Cerebro", "Tórax", "Abdomen y Pelvis", "Columna Cervical", "Columna Lumbar",
           "Cuello", "Senos Paranasales", "Oídos", "Angio TC Cerebral", "Angio TC Tórax",
           "Angio TC Abdominal"],
    "RM": ["Cerebro", "Columna Cervical", "Columna Dorsal", "Columna Lumbar",
           "Rodilla", "Hombro", "Cadera", "Muñeca", "Tobillo", "Abdomen",
           "Pelvis", "Mama", "Cardíaca"],
    "ECO": ["Abdomen", "Tiroides", "Mama", "Partes Blandas", "Músculo-esquelético",
            "Doppler Arterial", "Doppler Venoso", "Doppler Carotídeo",
            "Obstétrico", "Ginecológico", "Renal", "Vesical"],
    "MAMOGRAFIA": ["Bilateral", "Unilateral Derecha", "Unilateral Izquierda"],
    "PET-CT": ["Cuerpo Completo", "Cerebro"],
    "FLUOROSCOPIA": ["Esófago-Estómago-Duodeno", "Colon", "Uretrocistografía", "Histerosalpingografía"],
    "DENSITOMETRIA": ["Columna Lumbar y Cadera", "Cuerpo Completo"],
    "ANGIOGRAFIA": ["Cerebral", "Coronaria", "Periférica", "Abdominal"],
    "MEDICINA_NUCLEAR": ["Cintigrama Óseo", "Cintigrama Tiroideo", "Cintigrama Renal", "Cintigrama Miocárdico"],
}


# ══════════════════════════════════════════════════════════════════════════════
# PASO 1 — EXTRACCIÓN: Contexto DICOM → JSON estructurado
# ══════════════════════════════════════════════════════════════════════════════

EXTRACTION_SYSTEM_PROMPT = """Eres un sistema de extracción de hallazgos radiológicos. Tu ÚNICA tarea es leer el contexto DICOM y la información proporcionada, y extraer los hallazgos en formato JSON estructurado.

=== REGLAS ABSOLUTAS DE EXTRACCIÓN ===
1. Extrae SOLO lo que está explícitamente descrito en el texto de entrada.
2. Si un dato NO está presente en el texto → usa "no descrito" o "indeterminado".
3. NO completes datos faltantes con supuestos clínicos.
4. NO inferir hemorragia sin mención explícita de hiperdensidad o alta atenuación focal.
5. NO inferir isquemia sin mención explícita de hipodensidad o baja atenuación focal.
6. NO inventar lateralidad, dimensiones ni complicaciones.
7. NO agregar material metálico si no se describe explícitamente.
8. Las bandas de atenuación cuantitativas (ej: "banda 50-100 HU elevada") son datos neutros — NO interpretarlos como diagnóstico.

=== JERARQUÍA DE FUENTES (OBLIGATORIO) ===
Recibirás hasta 3 fuentes de información, cada una con su nivel de prioridad:

[FUENTE PRIMARIA — MÁXIMA PRIORIDAD] HALLAZGOS DEL RADIÓLOGO:
- Lo que el radiólogo observa directamente. Es la fuente MÁS confiable.
- Si el radiólogo describe un hallazgo, ese ES el hallazgo_principal.
- NUNCA contradigas al radiólogo con datos de otras fuentes.

[FUENTE SECUNDARIA — ORIENTA, NO DECIDE] CONTEXTO CLÍNICO:
- Sospecha clínica, antecedentes, motivo de estudio.
- ORIENTA la búsqueda, pero NO determina el diagnóstico.
- Si el contexto dice "sospecha de hemorragia" pero no hay evidencia → NO clasificar como hemorrágico.
- NUNCA dejes que una sospecha clínica sobreescriba los hallazgos observados.

[FUENTE COMPLEMENTARIA — NO DIAGNÓSTICA] ANÁLISIS DICOM TÉCNICO:
- Datos cuantitativos automáticos (bandas de atenuación, distribución HU).
- COMPLEMENTA a las otras fuentes, NUNCA impone diagnóstico.
- Los porcentajes de atenuación NO son diagnósticos por sí solos.

=== RESOLUCIÓN DE CONFLICTOS ===
1. Si RADIÓLOGO dice X y DICOM sugiere Y → seguir al RADIÓLOGO.
2. Si RADIÓLOGO dice X y CLÍNICA dice Y → seguir al RADIÓLOGO.
3. Si solo hay CLÍNICA (sin radiólogo) y DICOM → seguir DICOM (imagen > sospecha).
4. Si CLÍNICA dice "hemorragia" pero DICOM no muestra hiperdensidad → hallazgo_principal = "indeterminado".
5. Si hay conflicto irresoluble entre fuentes → hallazgo_principal = "indeterminado".
6. Siempre indicar en "fuente_principal_utilizada" cuál fuente determinó el hallazgo_principal.
7. Si hubo conflicto, describirlo en "conflicto_entre_fuentes".

=== CONFIABILIDAD ===
- Asigna "confianza_anatomica" según qué tan precisa es la localización: "alta" si hay región clara, "baja" si es difusa o no descrita.
- Asigna "confianza_global" según la calidad del dato: "alta" si el hallazgo es claro y unívoco, "media" si hay datos parciales, "baja" si es ambiguo o insuficiente.
- Indica en "limitaciones" todo factor que reduzca la confianza (pocas series, sin contraste, artefactos, muestreo parcial).

=== REGLAS DE SEGURIDAD DIAGNÓSTICA ===
- NUNCA convertir "hipodenso" en "hiperdenso" ni viceversa.
- NUNCA convertir "isquémico" en "hemorrágico" ni viceversa.
- NUNCA rellenar campos con inferencias clínicas.
- Si hay ambigüedad entre isquémico y hemorrágico → hallazgo_principal = "indeterminado".
- Si el contexto clínico dice una cosa pero los datos cuantitativos sugieren otra → seguir los datos.

=== SALIDA ===
Responde ÚNICAMENTE con JSON válido. Sin markdown, sin explicaciones, sin texto adicional."""

# Schemas de extracción por modalidad/región
EXTRACTION_SCHEMAS: dict[str, dict[str, str]] = {
    "TC": {
        "Cerebro": """{
  "hallazgo_principal": "normal | isquemico | hemorragico | traumatico | indeterminado",
  "descripcion_hallazgo": "texto breve del hallazgo principal observado, o 'sin hallazgos patológicos'",
  "localizacion": "región anatómica del hallazgo (ej: lenticular, frontal, parietal) o 'no aplica'",
  "lateralidad": "derecho | izquierdo | bilateral | linea media | no descrito",
  "densidad": "hiperdenso | hipodenso | isodenso | mixto | no descrito",
  "dimensiones": "medidas si están disponibles o 'no descrito'",
  "efecto_masa": "presente (describir) | ausente | no descrito",
  "desviacion_linea_media": "medida en mm si disponible | ausente | no descrito",
  "extension_intraventricular": "presente | ausente | no descrito",
  "hidrocefalia": "presente | ausente | no descrito",
  "hallazgos_secundarios": ["lista de otros hallazgos menores"],
  "hallazgos_extracraneales": ["hallazgos fuera del encéfalo, ej: fracturas, partes blandas"],
  "confianza_anatomica": "alta | media | baja — qué tan confiable es la localización anatómica del hallazgo",
  "confianza_global": "alta | media | baja — confianza general en la extracción (alta: dato claro; baja: ambiguo o insuficiente)",
  "limitaciones": ["lista de factores que limitan la interpretación, ej: 'pocas series analizadas', 'sin contraste', 'artefacto de movimiento'"],
  "evidencia_textual": ["citas textuales del contexto de entrada que sustentan cada hallazgo"],
  "series_fuente": ["identificadores o descripciones de las series usadas para la extracción"],
  "fuente_principal_utilizada": "hallazgos_radiologo | contexto_clinico | analisis_dicom | ninguna",
  "conflicto_entre_fuentes": "descripción del conflicto entre fuentes, o 'sin conflicto'"
}"""
    }
}

# Schema genérico para modalidades/regiones sin schema específico pero con pipeline 3 pasos
GENERIC_EXTRACTION_SCHEMA = """{
  "hallazgo_principal": "normal | hallazgo patológico principal en 1-3 palabras",
  "descripcion": "descripción breve del hallazgo",
  "localizacion": "región anatómica o 'no aplica'",
  "lateralidad": "derecho | izquierdo | bilateral | no descrito",
  "hallazgos_secundarios": ["lista de hallazgos menores"],
  "confianza_global": "alta | media | baja",
  "limitaciones": ["factores que limitan la interpretación"],
  "evidencia_textual": ["citas textuales del contexto de entrada que sustentan el hallazgo"]
}"""


def has_extraction_schema(modality: str, region: str) -> bool:
    """¿Esta modalidad/región soporta pipeline 3 pasos?"""
    return _modular_has_extraction_schema(modality, region)


def _get_extraction_schema(modality: str, region: str) -> str:
    """Retorna el schema de extracción para la combinación modalidad/región."""
    return _modular_get_extraction_schema(modality, region)


def _extract_pure_clinical_context(clinical_context: str) -> str:
    """Extrae solo el contexto clínico puro, sin las secciones DICOM ni hallazgos.

    El frontend concatena con marcadores "--- Análisis DICOM automático ---"
    y "--- Hallazgos del radiólogo ---". Separar.
    """
    if not clinical_context:
        return ""
    parts = clinical_context.split("\n--- ")
    return parts[0].strip()


async def extract_findings(
    study_info: Optional[dict],
    clinical_context: Optional[str],
    modality: str,
    region: str,
) -> dict:
    """Paso 1: Contexto DICOM + clínico → JSON estructurado (Claude call 1)."""
    client = _get_client()
    schema = _get_extraction_schema(modality, region)

    # Separar las 3 fuentes de información
    hallazgos_radiologo = study_info.get("hallazgos_clinicos", "") if study_info else ""
    dicom_analysis = study_info.get("dicom_analysis", "") if study_info else ""
    pure_context = _extract_pure_clinical_context(clinical_context or "")

    # Armar el input con etiquetas de prioridad
    parts = []
    parts.append(f"=== MODALIDAD: {modality} | REGIÓN: {region} ===\n")

    # FUENTE PRIMARIA — Hallazgos del radiólogo
    if hallazgos_radiologo:
        parts.append("=== [FUENTE PRIMARIA — MÁXIMA PRIORIDAD] HALLAZGOS DEL RADIÓLOGO ===")
        parts.append(hallazgos_radiologo)
        parts.append("")

    # FUENTE SECUNDARIA — Contexto clínico
    if pure_context:
        parts.append("=== [FUENTE SECUNDARIA — ORIENTA, NO DECIDE] CONTEXTO CLÍNICO ===")
        parts.append(pure_context)
        parts.append("")

    # FUENTE COMPLEMENTARIA — Análisis DICOM técnico
    if dicom_analysis:
        parts.append("=== [FUENTE COMPLEMENTARIA — NO DIAGNÓSTICA] ANÁLISIS DICOM TÉCNICO ===")
        parts.append(dicom_analysis)
        parts.append("")

    # FUENTE COMPLEMENTARIA ESTRUCTURADA — JSON clínico
    if study_info and study_info.get("json_clinico"):
        import json as _json
        parts.append("=== [FUENTE COMPLEMENTARIA ESTRUCTURADA — ANÁLISIS LOCAL] JSON CLÍNICO ===")
        parts.append(_json.dumps(study_info["json_clinico"], ensure_ascii=False, indent=2))
        parts.append("")

    # Metadatos adicionales del estudio (patient, study_description, etc.)
    if study_info:
        meta_keys = [k for k in study_info if k not in ("hallazgos_clinicos", "dicom_analysis", "json_clinico")]
        if meta_keys:
            parts.append("=== METADATOS DEL ESTUDIO ===")
            for k in meta_keys:
                v = study_info[k]
                if v:
                    parts.append(f"- {k}: {v}")
            parts.append("")

    parts.append(f"=== SCHEMA JSON DE SALIDA ===\n{schema}\n")
    parts.append("Extrae los hallazgos del contexto anterior y responde SOLO con el JSON.")

    user_content = "\n".join(parts)

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=[{
            "type": "text",
            "text": EXTRACTION_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_content}],
    )

    raw = response.content[0].text.strip()

    # Limpiar posible markdown wrapping
    if raw.startswith("```"):
        lines = raw.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines)

    try:
        findings = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse extraction JSON, using fallback: %s", raw[:200])
        findings = {
            "hallazgo_principal": "indeterminado",
            "descripcion_hallazgo": raw[:500],
            "soporte_textual": "Error de parsing en extracción automática",
        }

    return findings


# ══════════════════════════════════════════════════════════════════════════════
# PASO 2 — CLASIFICACIÓN: JSON → categoría (función pura, sin IA)
# ══════════════════════════════════════════════════════════════════════════════

CATEGORIES = ["normal", "isquemico", "hemorragico", "traumatico", "indeterminado"]


def _strip_accents(s: str) -> str:
    """Remove diacritical marks (á→a, é→e, etc.)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def classify_finding(findings: dict) -> str:
    """Paso 2: Clasificación conservadora desde JSON extraído.

    Reglas de prudencia:
    - confianza_global baja → indeterminado
    - confianza_anatomica baja sin hallazgo claro → indeterminado
    - Conflicto isquemia/hemorragia → indeterminado
    - Falta localización + lateralidad pero hay hallazgo sugerente → indeterminado
    - Mejor caer en indeterminado que sobrediagnosticar.
    """
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"

    normalized = _strip_accents(raw.strip().lower())

    # ── Reglas conservadoras de confiabilidad ──
    confianza_global = _strip_accents(str(findings.get("confianza_global", "")).strip().lower())
    confianza_anat = _strip_accents(str(findings.get("confianza_anatomica", "")).strip().lower())

    # Baja confianza global → indeterminado siempre
    if confianza_global == "baja":
        logger.info("Clasificación → indeterminado (confianza_global=baja)")
        return "indeterminado"

    # Conflicto entre fuentes → indeterminado
    conflicto = str(findings.get("conflicto_entre_fuentes", "sin conflicto")).strip().lower()
    if conflicto and conflicto not in ("sin conflicto", "no", "ninguno", ""):
        logger.info("Clasificación → indeterminado (conflicto entre fuentes: %s)", conflicto)
        return "indeterminado"

    # Detectar conflicto isquemia/hemorragia en el mismo texto
    has_isq = any(kw in normalized for kw in ("isquem", "hipodens", "infarto"))
    has_hem = any(kw in normalized for kw in ("hemorrag", "hematoma", "sangr", "hiperdens"))
    if has_isq and has_hem:
        logger.info("Clasificación → indeterminado (conflicto isquemia+hemorragia)")
        return "indeterminado"

    # Hallazgo patológico pero sin localización ni lateralidad → indeterminado
    localizacion = str(findings.get("localizacion", "no descrito")).strip().lower()
    lateralidad = str(findings.get("lateralidad", "no descrito")).strip().lower()
    hallazgo_pato = normalized not in ("normal", "sin hallazgos", "sin alteraciones",
                                        "sin patologia", "indeterminado")
    if hallazgo_pato and localizacion in ("no descrito", "no aplica", "") and lateralidad in ("no descrito", ""):
        if confianza_anat == "baja":
            logger.info("Clasificación → indeterminado (patológico sin localización, confianza_anatomica=baja)")
            return "indeterminado"

    # ── Mapeo directo ──
    if normalized in CATEGORIES:
        return normalized

    # ── Mapeo flexible por keywords (sin acentos) ──
    # Orden importa: traumático antes de hemorrágico (contusión hemorrágica = trauma)
    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"
    if any(kw in normalized for kw in ("traumat", "fractura", "contusi")):
        return "traumatico"
    if has_isq:
        return "isquemico"
    if has_hem:
        return "hemorragico"

    return "indeterminado"


def determine_redaction_mode(findings: dict) -> str:
    """Determina el modo de redacción según la suficiencia anatómica del JSON.

    - "clasico": hay sustento anatómico suficiente para un informe radiológico completo.
    - "limitado": solo hay datos cuantitativos, baja confianza o sin anatomía → informe breve y prudente.
    """
    hallazgo = _strip_accents(str(findings.get("hallazgo_principal", "")).strip().lower())

    # Normal siempre tiene sustento (describe normalidad anatómica)
    if hallazgo in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "clasico"

    confianza_anat = _strip_accents(str(findings.get("confianza_anatomica", "")).strip().lower())
    localizacion = str(findings.get("localizacion", "no descrito")).strip().lower()
    lateralidad = str(findings.get("lateralidad", "no descrito")).strip().lower()
    descripcion = _strip_accents(str(findings.get("descripcion_hallazgo", "")).strip().lower())

    # Confianza anatómica baja → siempre limitado
    if confianza_anat == "baja":
        return "limitado"

    # Sin localización real → limitado (a menos que sea normal ya capturado arriba)
    has_localizacion = localizacion not in ("no descrito", "no aplica", "")
    has_lateralidad = lateralidad not in ("no descrito", "")

    if not has_localizacion and not has_lateralidad:
        return "limitado"

    # Descripción solo menciona datos cuantitativos sin anatomía → limitado
    quant_only_markers = ("banda", "atenuacion", "hu ", "porcentaje", "distribucion")
    anat_markers = ("nucleo", "lenticular", "frontal", "parietal", "temporal",
                    "occipital", "cerebelo", "tronco", "ventricular", "silvian",
                    "capsul", "talamo", "ganglios basales", "cortical",
                    "linea media", "fosa posterior", "calota", "parenquima")
    has_anat = any(m in descripcion for m in anat_markers)
    has_quant_only = any(m in descripcion for m in quant_only_markers) and not has_anat

    if has_quant_only:
        return "limitado"

    return "clasico"


# ══════════════════════════════════════════════════════════════════════════════
# PASO 2.5 — PLANTILLAS POR CATEGORÍA
# ══════════════════════════════════════════════════════════════════════════════

# Plantillas de FORMATO — no de diagnóstico.
# Los campos entre {campo} se llenan exclusivamente desde el JSON extraído.
# No incluyen frases diagnósticas rígidas; la redacción la hace Claude desde el JSON.
CATEGORY_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "TC": {
        "Cerebro": {
            "normal": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{describir parénquima cerebral según JSON — solo si JSON confirma normalidad}
{describir sistema ventricular según JSON}
{describir línea media según JSON}
{describir colecciones si JSON las menciona, omitir si no}
{describir calota según JSON}

Impresión:
{resumen fiel: una frase descartando compromiso agudo si JSON es normal}""",

            "isquemico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{describir hallazgo principal según JSON: densidad + localización + lateralidad + dimensiones si disponibles}
{describir efecto_masa SOLO si JSON lo indica como presente}
{describir sistema ventricular según JSON}
{describir línea media según JSON}
{describir hallazgos secundarios según JSON, omitir si vacíos}
{describir calota según JSON}

Impresión:
{resumen fiel del hallazgo principal con localización y lateralidad del JSON}""",

            "hemorragico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{describir hallazgo principal según JSON: densidad + localización + lateralidad + dimensiones si disponibles}
{describir efecto_masa SOLO si JSON lo indica como presente}
{describir desviacion_linea_media SOLO si JSON indica presente con medida}
{describir extension_intraventricular SOLO si JSON indica presente}
{describir hidrocefalia SOLO si JSON indica presente}
{describir hallazgos secundarios según JSON, omitir si vacíos}
{describir calota según JSON}

Impresión:
{resumen fiel del hallazgo principal con complicaciones presentes en JSON}""",

            "traumatico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{describir hallazgo principal según JSON: tipo de lesión + localización + lateralidad}
{describir efecto_masa SOLO si JSON lo indica como presente}
{describir línea media según JSON}
{describir hallazgos extracraneales según JSON: fracturas, partes blandas}
{describir hallazgos secundarios según JSON, omitir si vacíos}

Impresión:
{resumen fiel de hallazgos traumáticos presentes en JSON}""",

            "indeterminado": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{describir hallazgos observados según JSON de forma neutra — sin asumir etiología}
{describir sistema ventricular según JSON}
{describir línea media según JSON}
{describir calota según JSON}
{si JSON indica limitaciones, mencionarlas}

Impresión:
{resumen neutra y cautelosa — sugerir correlación clínica y eventual estudio complementario}""",

            "_limitado": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
{traducir datos a lenguaje radiológico: "focos de alta/baja atenuación" — NUNCA valores HU crudos}
{NO mencionar porcentaje de imágenes, muestreo parcial ni métricas de procesamiento}
{NO describir estructuras anatómicas que no estén explícitamente confirmadas}
{indicar que la evaluación tiene limitaciones técnicas, sin detallar cuáles}

Impresión:
{1-2 frases: hallazgos no caracterizables con la presente técnica, se sugiere correlación clínica y revisión directa de imágenes}""",
        }
    }
}


def get_category_template(modality: str, region: str, category: str) -> str:
    """Paso 2.5: Seleccionar plantilla correcta según categoría."""
    return _modular_get_category_template(modality, region, category)


# ══════════════════════════════════════════════════════════════════════════════
# PASO 3 — REDACCIÓN: JSON + plantilla categoría → informe final
# ══════════════════════════════════════════════════════════════════════════════

REDACTION_SYSTEM_PROMPT = """Eres un radiólogo chileno experimentado redactando un pre-informe radiológico.
Tu tarea es redactar un informe FINAL a partir de un JSON de hallazgos extraídos y una plantilla de referencia.

=== REGLAS ABSOLUTAS DE REDACCIÓN ===
1. Redacta SOLO a partir de los datos del JSON de hallazgos. El JSON es tu ÚNICA fuente de verdad.
2. NO agregues hallazgos que no estén en el JSON.
3. NO transformes isquémico→hemorrágico ni hemorrágico→isquémico. NUNCA.
4. NO asumas dimensiones, lateralidad o complicaciones si el JSON dice "no descrito".
5. Si un dato es "no descrito" o "indeterminado" → omítelo del informe o exprésalo con cautela.
6. NO inventes material metálico, hemorragia, edema ni ningún hallazgo ausente del JSON.
7. Los marcadores [COMPLETAR] en la plantilla se reemplazan con datos del JSON. Si el JSON no tiene el dato → omitir la frase completa, NO dejar [COMPLETAR] en el informe final.

=== REGLAS DE SEGURIDAD DIAGNÓSTICA ===
- NUNCA convertir "hipodenso" en "hiperdenso".
- NUNCA convertir "isquémico" en "hemorrágico".
- NUNCA usar "hematoma" sin que el JSON indique sangre aguda o hiperdensidad.
- NUNCA usar "ACV isquémico" si el JSON describe hemorragia.
- NUNCA mencionar material metálico sin que el JSON lo indique.
- Si hay ambigüedad → redacción neutra.

=== ESTILO OBLIGATORIO ===
Redacta como un radiólogo de staff: prosa directa, frases cortas, sin relleno.
- Tono: formal médico pero conciso.
- Extensión: la mínima necesaria.

=== ESTRUCTURA DEL INFORME ===
1. LÍNEA DE ESTUDIO: "[Modalidad completa] de [región anatómica]."
2. HALLAZGOS: Prosa directa, un hallazgo por línea, sin subtítulos, sin viñetas.
3. IMPRESIÓN: Diagnóstico principal conciso.

=== SECCIONES QUE NO DEBEN APARECER ===
- NO incluir sección "Técnica", "Indicación clínica", "Recomendaciones", encabezados, firmas.

=== MODOS DE REDACCIÓN ===
El usuario te indicará el MODO DE REDACCIÓN. Es OBLIGATORIO seguirlo.

MODO RADIOLÓGICO CLÁSICO:
- Redacta como un radiólogo de staff: frases breves, hallazgos anatómicos concretos, impresión directa.
- NO mencionar análisis automatizado, confianza diagnóstica, bandas HU ni limitaciones computacionales.
- El informe debe parecer escrito por un humano que revisó las imágenes.

MODO INFORME LIMITADO:
- NO intentar sonar como un informe radiológico anatómico completo.
- NO inventar estructuras, lesiones ni localización anatómica que no esté en el JSON.
- Emitir un informe breve, prudente y conservador.
- PROHIBIDO mencionar detalles técnicos del procesamiento automatizado:
  * NO mencionar valores HU numéricos, medias, rangos ni bandas de atenuación crudas.
  * NO mencionar porcentaje de imágenes analizadas, cantidad de cortes ni "muestreo parcial".
  * NO mencionar "confianza anatómica", "confianza global" ni métricas internas.
  * NO mencionar "análisis automatizado", "procesamiento automático" ni "sistema de análisis".
  * NO transcribir datos crudos del JSON al informe.
- Traducir los datos cuantitativos a lenguaje radiológico genérico:
  * En vez de "100-400 HU" → "focos de alta atenuación"
  * En vez de "muestreo parcial de 13/53 imágenes" → "estudio con evaluación limitada"
  * En vez de "confianza anatómica baja" → simplemente no asumir localización
- Usar frases como:
  "Estudio con evaluación limitada para caracterización definitiva."
  "Se identifican focos de alta/baja atenuación sin localización anatómica precisa."
  "Se sugiere revisión directa de las imágenes y correlación clínica."
  "Los hallazgos no permiten una caracterización definitiva con la presente técnica."
- NO redactar impresiones diagnósticas firmes.
- El informe debe parecer escrito por un radiólogo cauteloso, NO por un sistema automatizado.

=== SALIDA ===
Responde ÚNICAMENTE con el texto del informe. Sin markdown, sin explicaciones."""


async def generate_report_from_findings(
    findings: dict,
    category_template: str,
    category: str,
    db: AsyncSession,
    modality: str,
    region: str,
    redaction_mode: str = "clasico",
) -> tuple[str, str]:
    """Paso 3: JSON + plantilla categoría → informe final (Claude call 2).
    Retorna (informe_texto, prompt_enviado).
    """
    client = _get_client()

    # Get few-shot examples for this modality/region
    examples = await _get_fewshot_examples_by_modality(db, modality, region)

    parts = []

    # Modo de redacción (ANTES de todo lo demás)
    mode_label = "RADIOLÓGICO CLÁSICO" if redaction_mode == "clasico" else "INFORME LIMITADO"
    parts.append(f"=== MODO DE REDACCIÓN: {mode_label} ===")
    parts.append(f"OBLIGATORIO: Redactar en modo {mode_label}.\n")

    # Few-shot examples
    if examples:
        parts.append("=== EJEMPLOS DE INFORMES ANTERIORES BIEN CALIFICADOS ===")
        for i, ex in enumerate(examples, 1):
            parts.append(f"\n--- Ejemplo {i} (Rating: {ex['rating']}/5) ---")
            if ex["clinical_context"]:
                parts.append(f"Contexto: {ex['clinical_context']}")
            parts.append(f"Informe:\n{ex['response']}")
        parts.append("\n=== FIN DE EJEMPLOS ===\n")

    parts.append(f"=== CATEGORÍA CLASIFICADA: {category.upper()} ===\n")
    parts.append(f"=== JSON DE HALLAZGOS EXTRAÍDOS ===\n{json.dumps(findings, ensure_ascii=False, indent=2)}\n")
    parts.append(f"=== PLANTILLA DE REFERENCIA ({category}) ===\n{category_template}\n=== FIN PLANTILLA ===\n")
    parts.append("Redacta el informe radiológico final usando EXCLUSIVAMENTE los datos del JSON de hallazgos.")
    parts.append("Usa la plantilla como guía de estructura, pero los DATOS deben venir del JSON.")
    parts.append("Si el JSON tiene campos 'no descrito' o 'indeterminado', omite esas líneas o exprésalas con cautela.")

    user_content = "\n".join(parts)

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": REDACTION_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_content}],
    )

    report = response.content[0].text.strip()
    return report, user_content


# ══════════════════════════════════════════════════════════════════════════════
# PASO 4 — VALIDACIÓN POST-GENERACIÓN: consistencia JSON vs informe
# ══════════════════════════════════════════════════════════════════════════════

def validate_report_consistency(report: str, findings: dict, category: str) -> list[str]:
    """Valida que el informe generado sea consistente con el JSON de hallazgos.

    Retorna lista de inconsistencias detectadas (vacía = OK).
    Cada inconsistencia es un string descriptivo.
    """
    report_lower = _strip_accents(report.lower())
    violations = []

    # 1. Si categoría NO es hemorrágica, el informe no debería mencionar hemorragia/hematoma
    if category != "hemorragico":
        hemo_terms = ["hematoma", "hemorragia", "sangrado agudo", "sangre aguda"]
        for term in hemo_terms:
            if term in report_lower:
                violations.append(f"Informe menciona '{term}' pero categoría es '{category}'")

    # 2. Si categoría NO es isquémica, el informe no debería mencionar isquemia/infarto
    if category != "isquemico":
        isq_terms = ["isquemia", "isquemico", "infarto cerebral", "acv isquemico"]
        for term in isq_terms:
            if term in report_lower:
                violations.append(f"Informe menciona '{term}' pero categoría es '{category}'")

    # 3. Material metálico: no mencionar si no está en JSON
    hallazgos_sec = findings.get("hallazgos_secundarios", [])
    hallazgos_extra = findings.get("hallazgos_extracraneales", [])
    all_text = json.dumps(findings, ensure_ascii=False).lower()
    metal_terms = ["material metalico", "implante metalico", "metal"]
    for term in metal_terms:
        if term in report_lower and term not in _strip_accents(all_text):
            violations.append(f"Informe menciona '{term}' pero no está en JSON")

    # 4. Lateralidad inventada: si JSON dice "no descrito", informe no debería especificar
    lat = str(findings.get("lateralidad", "")).strip().lower()
    if lat in ("no descrito", ""):
        if "derecho" in report_lower or "izquierdo" in report_lower:
            # Solo si es sobre el hallazgo principal (no sobre normalidad anatómica)
            desc = _strip_accents(str(findings.get("descripcion_hallazgo", "")).lower())
            if category not in ("normal", "indeterminado") and "normal" not in desc:
                violations.append("Informe especifica lateralidad pero JSON indica 'no descrito'")

    # 5. Efecto de masa: no mencionar como presente si JSON dice ausente
    efecto = str(findings.get("efecto_masa", "")).strip().lower()
    if efecto == "ausente" and "efecto de masa" in report_lower:
        # Verificar que no diga "sin efecto de masa" (eso sí es válido)
        if "sin efecto de masa" not in report_lower and "no se identifica efecto de masa" not in report_lower:
            violations.append("Informe menciona efecto de masa pero JSON indica 'ausente'")

    # 6. Si fuente principal fue radiólogo, verificar coherencia con hallazgo_principal
    fuente = str(findings.get("fuente_principal_utilizada", "")).strip().lower()
    if "radiologo" in fuente:
        hallazgo = _strip_accents(str(findings.get("hallazgo_principal", "")).lower())
        # Si radiólogo dijo isquémico, informe no debe mencionar hemorrágico
        if "isquem" in hallazgo:
            for term in ["hematoma", "hemorragia", "sangrado agudo"]:
                if term in report_lower and "sin " + term not in report_lower:
                    violations.append(f"Radiólogo indicó hallazgo isquémico pero informe menciona '{term}'")
        # Viceversa
        if "hemorrag" in hallazgo or "hematoma" in hallazgo:
            for term in ["isquemia", "infarto cerebral"]:
                if term in report_lower and "sin " + term not in report_lower:
                    violations.append(f"Radiólogo indicó hallazgo hemorrágico pero informe menciona '{term}'")

    return violations


# ══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL — Orquesta el pipeline
# ══════════════════════════════════════════════════════════════════════════════

async def generate_pre_report(
    template: Optional[RadTemplate],
    clinical_context: Optional[str],
    study_info: Optional[dict],
    db: AsyncSession,
    modality: Optional[str] = None,
    region: Optional[str] = None,
) -> tuple[str, str, Optional[dict], Optional[str], Optional[dict]]:
    """
    Genera un pre-informe radiológico.

    Si la modalidad/región tiene schema de extracción → pipeline 3 pasos.
    Si no → pipeline legacy (1 paso con plantilla).

    Retorna (pre_report_text, prompt_sent, findings_json, finding_category, pipeline_metadata).
    """
    # Resolver modalidad/región
    mod = modality or (template.modality if template else "")
    reg = region or (template.region if template else "")

    if has_extraction_schema(mod, reg) and template is None:
        # ── PIPELINE 3 PASOS ──
        logger.info("Pipeline 3 pasos para %s/%s", mod, reg)

        # Paso 1: Extraer hallazgos → JSON
        findings_json = await extract_findings(study_info, clinical_context, mod, reg)
        logger.info("Extracción completada: hallazgo=%s", findings_json.get("hallazgo_principal"))

        # Paso 2: Clasificar (usa registry modular)
        category = classify_for_modality(findings_json, mod, reg)
        logger.info("Clasificación: %s", category)

        # Paso 2.5: Determinar modo de redacción
        redaction_mode = determine_redaction_mode(findings_json)

        # Construir metadata de trazabilidad
        json_clinico = study_info.get("json_clinico") if study_info else None
        pipeline_metadata = {
            "fuente_principal_utilizada": findings_json.get("fuente_principal_utilizada", "no especificada"),
            "conflicto_entre_fuentes": findings_json.get("conflicto_entre_fuentes", "sin conflicto"),
            "categoria_original": category,
            "modo_redaccion": redaction_mode,
            "hubo_regeneracion": False,
            "violaciones_detectadas": [],
            "json_clinico": json_clinico,
        }
        logger.info("Modo de redacción: %s", redaction_mode)

        # Paso 3: Seleccionar plantilla por categoría y redactar
        if redaction_mode == "limitado":
            category_template = get_category_template(mod, reg, "_limitado")
        else:
            category_template = get_category_template(mod, reg, category)
        report, prompt_sent = await generate_report_from_findings(
            findings_json, category_template, category, db, mod, reg,
            redaction_mode=redaction_mode,
        )

        # Paso 4: Validación post-generación
        violations = validate_report_consistency(report, findings_json, category)
        if violations:
            logger.warning("Validación post-generación detectó %d inconsistencias: %s",
                           len(violations), "; ".join(violations))
            pipeline_metadata["hubo_regeneracion"] = True
            pipeline_metadata["violaciones_detectadas"] = violations
            pipeline_metadata["categoria_post_validacion"] = "indeterminado"
            # Regenerar con plantilla indeterminada (cautelosa)
            fallback_template = get_category_template(mod, reg, "indeterminado")
            report, prompt_sent = await generate_report_from_findings(
                findings_json, fallback_template, "indeterminado", db, mod, reg,
                redaction_mode=redaction_mode,
            )
            # Segunda validación — si falla de nuevo, agregar advertencia
            violations_2 = validate_report_consistency(report, findings_json, "indeterminado")
            if violations_2:
                logger.error("Validación falló 2 veces: %s", "; ".join(violations_2))
                report = report + "\n\n[ADVERTENCIA: Este informe requiere revisión manual por inconsistencias detectadas automáticamente.]"

        return report, prompt_sent, findings_json, category, pipeline_metadata
    else:
        # ── PIPELINE LEGACY (1 paso) ──
        if template is None:
            raise ValueError("Se requiere template_id para modalidades sin clasificación automática")

        report, prompt_sent = await _legacy_generate(template, clinical_context, study_info, db)
        return report, prompt_sent, None, None, None


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE LEGACY — 1 paso (sin cambios de lógica)
# ══════════════════════════════════════════════════════════════════════════════

LEGACY_SYSTEM_PROMPT = """Eres un radiólogo chileno experimentado redactando un pre-informe radiológico.
Tu rol es generar un informe CONCISO y CLÍNICO a partir de una plantilla y el contexto proporcionado.

=== ESTILO OBLIGATORIO ===
Redacta como un radiólogo de staff: prosa directa, frases cortas, sin relleno.
- Tono: formal médico pero conciso, sin ser verborrágico.
- Extensión: la mínima necesaria para transmitir los hallazgos y la impresión.

=== ESTRUCTURA DEL INFORME ===
El informe tiene exactamente estas secciones:

1. LÍNEA DE ESTUDIO (primera línea):
   "[Modalidad completa] de [región anatómica]."
   Ejemplo: "Tomografía computada de encéfalo sin contraste."
   - NO incluir modelo del equipo ni fabricante.
   - NO incluir parámetros técnicos (kVp, mAs, grosor de corte).

2. HALLAZGOS:
   - Prosa directa, un hallazgo relevante por línea.
   - Sin subtítulos (NO escribir "Parénquima cerebral:", "Línea media:", "Fosa posterior:", etc.).
   - Sin viñetas (-, *, •). Solo texto plano.
   - Sin valores en Unidades Hounsfield (UH) a menos que sea clínicamente imprescindible.
   - NO describir lo normal en detalle si no aporta: "calota sin alteraciones" es suficiente.
   - Calcificaciones fisiológicas (plexos coroideos, glándula pineal) NO reportar a menos que sean
     clínicamente relevantes.
   - Material metálico: mencionar UNA sola vez y solo si limita la evaluación o es hallazgo nuevo.
   - Senos paranasales y mastoides: solo reportar si hay opacificación; si son normales, omitir.

3. IMPRESIÓN:
   - Si estudio normal: 1 sola frase.
   - Si hay hallazgo patológico: diagnóstico principal + lateralidad + tamaño si corresponde.
   - Solo sugerir correlación clínica o seguimiento cuando hay hallazgo patológico que lo amerite.
   - NO incluir código CIE-10 en el texto.

=== SECCIONES QUE NO DEBEN APARECER ===
- NO incluir sección "Técnica", "Indicación clínica", "Recomendaciones", encabezados, firmas.

=== USO DEL ANÁLISIS DICOM ===
Si se proporciona un análisis DICOM cuantitativo:
- Úsalo para ORIENTAR tus hallazgos.
- NO transcribir porcentajes ni valores crudos al informe.
- NO mencionar que el análisis fue automatizado.
- Traduce los datos cuantitativos a lenguaje clínico radiológico.

=== REGLAS DE SEGURIDAD DIAGNÓSTICA ===
- NUNCA convertir "hipodenso" en "hiperdenso".
- NUNCA convertir "isquémico" en "hemorrágico".
- NUNCA usar "hematoma" sin mención de sangre aguda/hiperdensidad.
- NUNCA usar "ACV isquémico" si contexto describe hemorragia.
- NUNCA mencionar material metálico sin detección/descripción.
- Si hay ambigüedad → redacción neutra.

=== MARCAS [COMPLETAR] ===
Marca con [COMPLETAR: descripción] SOLO información que el radiólogo DEBE verificar en las imágenes
y que no se puede inferir del contexto.

=== REGLAS ABSOLUTAS ===
1. NUNCA inventes datos del paciente.
2. El pre-informe es texto limpio y editable, NO JSON.
3. Responde ÚNICAMENTE con el texto del informe, sin explicaciones ni markdown.
4. Si se proporcionan ejemplos de informes anteriores, imita su estilo y concisión.

=== EJEMPLOS DE REFERENCIA ===

Ejemplo 1 — TC Encéfalo normal:
  Tomografía computada de encéfalo sin contraste.

  Hallazgos:
  Parénquima cerebral de densidad conservada sin lesiones focales.
  Sistema ventricular de tamaño y configuración normal.
  Estructuras de la línea media centradas.
  No se identifican colecciones hemorrágicas intra ni extra-axiales.
  Calota sin alteraciones agudas.

  Impresión:
  No se identifican alteraciones agudas del encéfalo con la presente técnica.

Ejemplo 2 — TC Encéfalo con hematoma:
  Tomografía computada de encéfalo sin contraste.

  Hallazgos:
  Hematoma intraparenquimatoso lenticular izquierdo de aproximadamente 3 x 2 cm, con densidad compatible con sangrado agudo.
  Discreto efecto de masa local con borramiento parcial del asta frontal del ventrículo lateral izquierdo.
  No se identifica extensión intraventricular.
  Línea media con desviación de 3 mm hacia la derecha.
  Fosa posterior sin lesiones.
  Calota sin fracturas.

  Impresión:
  Hematoma agudo lenticular izquierdo con efecto de masa local y desviación de línea media de 3 mm. Se sugiere control evolutivo."""


async def get_fewshot_examples(
    db: AsyncSession,
    template_id,
    modality: str,
    region: str,
    limit: int = 3,
) -> List[dict]:
    """Busca los mejores ejemplos previos (rating >= 4) para la combinación plantilla/modalidad/región."""
    result = await db.execute(
        select(RadReportHistory)
        .where(
            RadReportHistory.template_id == template_id,
            RadReportHistory.modality == modality,
            RadReportHistory.region == region,
            RadReportHistory.rating >= 4,
        )
        .order_by(desc(RadReportHistory.rating), desc(RadReportHistory.created_at))
        .limit(limit)
    )
    examples = result.scalars().all()
    return [
        {
            "clinical_context": ex.clinical_context or "",
            "response": ex.response_received,
            "rating": ex.rating,
        }
        for ex in examples
    ]


async def _get_fewshot_examples_by_modality(
    db: AsyncSession,
    modality: str,
    region: str,
    limit: int = 3,
) -> List[dict]:
    """Busca los mejores ejemplos previos (rating >= 4) para la modalidad/región (sin template_id)."""
    result = await db.execute(
        select(RadReportHistory)
        .where(
            RadReportHistory.modality == modality,
            RadReportHistory.region == region,
            RadReportHistory.rating >= 4,
        )
        .order_by(desc(RadReportHistory.rating), desc(RadReportHistory.created_at))
        .limit(limit)
    )
    examples = result.scalars().all()
    return [
        {
            "clinical_context": ex.clinical_context or "",
            "response": ex.response_received,
            "rating": ex.rating,
        }
        for ex in examples
    ]


def _build_prompt(
    template: RadTemplate,
    examples: List[dict],
    clinical_context: Optional[str],
    study_info: Optional[dict],
) -> str:
    """Construye el mensaje de usuario para Claude (pipeline legacy)."""
    parts = []

    # Few-shot examples
    if examples:
        parts.append("=== EJEMPLOS DE INFORMES ANTERIORES BIEN CALIFICADOS ===")
        for i, ex in enumerate(examples, 1):
            parts.append(f"\n--- Ejemplo {i} (Rating: {ex['rating']}/5) ---")
            if ex["clinical_context"]:
                parts.append(f"Contexto: {ex['clinical_context']}")
            parts.append(f"Informe:\n{ex['response']}")
        parts.append("\n=== FIN DE EJEMPLOS ===\n")

    # Template
    parts.append(f"=== PLANTILLA A USAR ===")
    parts.append(f"Nombre: {template.name}")
    parts.append(f"Modalidad: {template.modality}")
    parts.append(f"Región: {template.region}")
    parts.append(f"\n{template.template_text}\n")
    parts.append(f"=== FIN DE PLANTILLA ===\n")

    # Study info
    if study_info:
        parts.append("=== INFORMACIÓN DEL ESTUDIO ===")
        for k, v in study_info.items():
            if v:
                parts.append(f"- {k}: {v}")
        parts.append("")

    # Clinical context
    if clinical_context:
        parts.append(f"=== CONTEXTO CLÍNICO ===\n{clinical_context}\n")

    parts.append("Genera el pre-informe radiológico siguiendo la plantilla proporcionada.")
    return "\n".join(parts)


async def _legacy_generate(
    template: RadTemplate,
    clinical_context: Optional[str],
    study_info: Optional[dict],
    db: AsyncSession,
) -> tuple[str, str]:
    """Pipeline antiguo (1 paso) para modalidades sin schema específico."""
    client = _get_client()

    examples = await get_fewshot_examples(
        db, template.id, template.modality, template.region
    )

    user_content = _build_prompt(template, examples, clinical_context, study_info)

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": LEGACY_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_content}],
    )

    pre_report = response.content[0].text.strip()
    return pre_report, user_content
