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

EXTRACTION_SYSTEM_PROMPT = """Eres un sistema de extracción de hallazgos radiológicos. Tu ÚNICA tarea es leer el contexto DICOM y la información clínica proporcionada, y extraer los hallazgos en formato JSON estructurado.

=== REGLAS ABSOLUTAS DE EXTRACCIÓN ===
1. Extrae SOLO lo que está explícitamente descrito en el texto de entrada.
2. Si un dato NO está presente en el texto → usa "no descrito" o "indeterminado".
3. NO completes datos faltantes con supuestos clínicos.
4. NO inferir hemorragia sin mención explícita de hiperdensidad, sangre aguda, o hematoma.
5. NO inferir isquemia sin mención explícita de hipodensidad, infarto, o isquemia.
6. NO inventar lateralidad, dimensiones ni complicaciones.
7. NO agregar material metálico si no se menciona.

=== REGLAS DE SEGURIDAD DIAGNÓSTICA ===
- NUNCA convertir "hipodenso" en "hiperdenso" ni viceversa.
- NUNCA convertir "isquémico" en "hemorrágico" ni viceversa.
- NUNCA usar "hematoma" sin mención de sangre aguda o hiperdensidad en la entrada.
- NUNCA rellenar campos con inferencias clínicas.
- Si hay ambigüedad entre isquémico y hemorrágico → "indeterminado".

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
  "soporte_textual": "cita textual del fragmento de entrada que sustenta el hallazgo principal"
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
  "soporte_textual": "cita textual del fragmento de entrada que sustenta el hallazgo"
}"""


def has_extraction_schema(modality: str, region: str) -> bool:
    """¿Esta modalidad/región soporta pipeline 3 pasos?"""
    return modality in EXTRACTION_SCHEMAS and region in EXTRACTION_SCHEMAS[modality]


def _get_extraction_schema(modality: str, region: str) -> str:
    """Retorna el schema de extracción para la combinación modalidad/región."""
    if modality in EXTRACTION_SCHEMAS and region in EXTRACTION_SCHEMAS[modality]:
        return EXTRACTION_SCHEMAS[modality][region]
    return GENERIC_EXTRACTION_SCHEMA


async def extract_findings(
    study_info: Optional[dict],
    clinical_context: Optional[str],
    modality: str,
    region: str,
) -> dict:
    """Paso 1: Contexto DICOM + clínico → JSON estructurado (Claude call 1)."""
    client = _get_client()
    schema = _get_extraction_schema(modality, region)

    # Armar el input para extracción
    parts = []
    parts.append(f"=== MODALIDAD: {modality} | REGIÓN: {region} ===\n")

    if study_info:
        parts.append("=== INFORMACIÓN DEL ESTUDIO ===")
        for k, v in study_info.items():
            if v:
                parts.append(f"- {k}: {v}")
        parts.append("")

    if clinical_context:
        parts.append(f"=== CONTEXTO CLÍNICO ===\n{clinical_context}\n")

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
    """Paso 2: Lee hallazgo_principal del JSON y retorna la categoría."""
    raw = findings.get("hallazgo_principal", "indeterminado")
    if not raw or not isinstance(raw, str):
        return "indeterminado"

    normalized = _strip_accents(raw.strip().lower())

    # Mapeo directo
    if normalized in CATEGORIES:
        return normalized

    # Mapeo flexible por keywords (sin acentos)
    # Orden importa: traumático antes de hemorrágico (contusión hemorrágica = trauma)
    if normalized in ("normal", "sin hallazgos", "sin alteraciones", "sin patologia"):
        return "normal"
    if any(kw in normalized for kw in ("traumat", "fractura", "contusi")):
        return "traumatico"
    if any(kw in normalized for kw in ("isquem", "hipodens", "infarto")):
        return "isquemico"
    if any(kw in normalized for kw in ("hemorrag", "hematoma", "sangr", "hiperdens")):
        return "hemorragico"

    return "indeterminado"


# ══════════════════════════════════════════════════════════════════════════════
# PASO 2.5 — PLANTILLAS POR CATEGORÍA
# ══════════════════════════════════════════════════════════════════════════════

CATEGORY_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "TC": {
        "Cerebro": {
            "normal": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
Parénquima cerebral de densidad conservada sin lesiones focales.
Sistema ventricular de tamaño y configuración normal.
Estructuras de la línea media centradas.
No se identifican colecciones hemorrágicas intra ni extra-axiales.
Calota sin alteraciones agudas.

Impresión:
No se identifican alteraciones agudas del encéfalo con la presente técnica.""",

            "isquemico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
Área hipodensa en [LOCALIZACIÓN] [LATERALIDAD] de aproximadamente [DIMENSIONES], sugerente de lesión isquémica [aguda/subaguda].
[EFECTO_MASA: Sin efecto de masa significativo / Con discreto efecto de masa local].
Sistema ventricular sin dilatación aguda.
Estructuras de la línea media centradas.
No se identifican colecciones hemorrágicas.
Calota sin alteraciones agudas.

Impresión:
Área hipodensa [LOCALIZACIÓN] [LATERALIDAD] compatible con lesión isquémica. Correlación clínica sugerida.""",

            "hemorragico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
Imagen hiperdensa en [LOCALIZACIÓN] [LATERALIDAD] de aproximadamente [DIMENSIONES], compatible con hematoma [intraparenquimatoso/extra-axial] agudo.
[EFECTO_MASA: Efecto de masa sobre estructuras adyacentes].
[DESVIACIÓN: Línea media con desviación de X mm / centrada].
[EXTENSIÓN_INTRAVENTRICULAR: Sin extensión / Con extensión intraventricular].
[HIDROCEFALIA: Sin hidrocefalia / Con hidrocefalia asociada].
Calota sin fracturas.

Impresión:
Hematoma agudo [LOCALIZACIÓN] [LATERALIDAD] con [descripción de complicaciones]. Se sugiere control evolutivo.""",

            "traumatico": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
[Describir hallazgos traumáticos: contusiones, hematomas, fracturas según JSON].
[EFECTO_MASA si presente].
[Estado de línea media].
[Colecciones extra-axiales si presentes].
[Estado de calota y base de cráneo].

Impresión:
[Hallazgos traumáticos principales]. Correlación clínica sugerida.""",

            "indeterminado": """Tomografía computada de encéfalo sin contraste.

Hallazgos:
[Describir hallazgos observados de forma neutra, sin asumir etiología].
Sistema ventricular [descripción].
Estructuras de la línea media [centradas/desviadas].
[Colecciones hemorrágicas: presentes/ausentes].
Calota [descripción].

Impresión:
[Hallazgo principal descrito de forma neutra]. Se sugiere correlación clínica y eventualmente estudio complementario.""",
        }
    }
}


def get_category_template(modality: str, region: str, category: str) -> str:
    """Paso 2.5: Seleccionar plantilla correcta según categoría."""
    mod_templates = CATEGORY_TEMPLATES.get(modality, {})
    reg_templates = mod_templates.get(region, {})
    template = reg_templates.get(category)
    if template:
        return template
    # Fallback a indeterminado
    return reg_templates.get("indeterminado", "")


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

=== SALIDA ===
Responde ÚNICAMENTE con el texto del informe. Sin markdown, sin explicaciones."""


async def generate_report_from_findings(
    findings: dict,
    category_template: str,
    category: str,
    db: AsyncSession,
    modality: str,
    region: str,
) -> tuple[str, str]:
    """Paso 3: JSON + plantilla categoría → informe final (Claude call 2).
    Retorna (informe_texto, prompt_enviado).
    """
    client = _get_client()

    # Get few-shot examples for this modality/region
    examples = await _get_fewshot_examples_by_modality(db, modality, region)

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
# FUNCIÓN PRINCIPAL — Orquesta el pipeline
# ══════════════════════════════════════════════════════════════════════════════

async def generate_pre_report(
    template: Optional[RadTemplate],
    clinical_context: Optional[str],
    study_info: Optional[dict],
    db: AsyncSession,
    modality: Optional[str] = None,
    region: Optional[str] = None,
) -> tuple[str, str, Optional[dict], Optional[str]]:
    """
    Genera un pre-informe radiológico.

    Si la modalidad/región tiene schema de extracción → pipeline 3 pasos.
    Si no → pipeline legacy (1 paso con plantilla).

    Retorna (pre_report_text, prompt_sent, findings_json, finding_category).
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

        # Paso 2: Clasificar
        category = classify_finding(findings_json)
        logger.info("Clasificación: %s", category)

        # Paso 3: Seleccionar plantilla por categoría y redactar
        category_template = get_category_template(mod, reg, category)
        report, prompt_sent = await generate_report_from_findings(
            findings_json, category_template, category, db, mod, reg
        )

        return report, prompt_sent, findings_json, category
    else:
        # ── PIPELINE LEGACY (1 paso) ──
        if template is None:
            raise ValueError("Se requiere template_id para modalidades sin clasificación automática")

        report, prompt_sent = await _legacy_generate(template, clinical_context, study_info, db)
        return report, prompt_sent, None, None


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
