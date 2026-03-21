"""
Servicio AsistRad — Generación de pre-informes radiológicos asistidos por plantillas.
Usa Claude Sonnet para generar pre-informes a partir de plantillas + few-shot examples.
"""
import anthropic
import json
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from config import settings
from models.asistrad import RadTemplate, RadReportHistory

# Reuse same client pattern as claude_service
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


# ── System prompt para AsistRad ─────────────────────────────────────────────

ASISTRAD_SYSTEM_PROMPT = """Eres un radiólogo chileno experimentado redactando un pre-informe radiológico.
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
   - NO describir lo normal en detalle si no aporta: "calota sin alteraciones" es suficiente,
     no hace falta "estructuras óseas de la calota y base de cráneo sin alteraciones agudas evidentes".
   - Calcificaciones fisiológicas (plexos coroideos, glándula pineal) NO reportar a menos que sean
     clínicamente relevantes.
   - Material metálico: mencionar UNA sola vez y solo si limita la evaluación o es hallazgo nuevo.
   - Senos paranasales y mastoides: solo reportar si hay opacificación; si son normales, omitir.

3. IMPRESIÓN:
   - Si estudio normal: 1 sola frase ("No se identifican alteraciones agudas del encéfalo con la presente técnica.").
   - Si hay hallazgo patológico: diagnóstico principal + lateralidad + tamaño si corresponde.
   - Solo sugerir correlación clínica o seguimiento cuando hay hallazgo patológico que lo amerite.
   - NO incluir código CIE-10 en el texto.
   - NO incluir "correlación clínica urgente" si ya se describe una emergencia obvia.

=== SECCIONES QUE NO DEBEN APARECER ===
- NO incluir sección "Técnica" (esa información va en campos separados del sistema).
- NO incluir sección "Indicación clínica" en el cuerpo del informe (se maneja aparte).
- NO incluir sección "Recomendaciones" separada.
- NO incluir encabezados institucionales, fechas, firmas.

=== USO DEL ANÁLISIS DICOM ===
Si se proporciona un análisis DICOM cuantitativo (distribución de tejidos, HU, etc.):
- Úsalo para ORIENTAR tus hallazgos (ej: si dice "4.5% sangre aguda", busca describir un hematoma).
- NO transcribir los porcentajes ni valores crudos al informe.
- NO mencionar que el análisis fue automatizado ni cuántos cortes se muestrearon.
- Traduce los datos cuantitativos a lenguaje clínico radiológico.

=== MARCAS [COMPLETAR] ===
Marca con [COMPLETAR: descripción] SOLO información que el radiólogo DEBE verificar en las imágenes
y que no se puede inferir del contexto. Típicamente:
- Lateralidad cuando no está clara.
- Dimensiones de lesiones focales.
- Presencia/ausencia de efecto de masa o extensión intraventricular.
NO marcar cosas obvias o irrelevantes.

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


def _build_prompt(
    template: RadTemplate,
    examples: List[dict],
    clinical_context: Optional[str],
    study_info: Optional[dict],
) -> str:
    """Construye el mensaje de usuario para Claude."""
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


async def generate_pre_report(
    template: RadTemplate,
    clinical_context: Optional[str],
    study_info: Optional[dict],
    db: AsyncSession,
) -> tuple[str, str]:
    """
    Genera un pre-informe usando Claude y la plantilla.
    Retorna (pre_report_text, prompt_sent).
    """
    client = _get_client()

    # Get few-shot examples
    examples = await get_fewshot_examples(
        db, template.id, template.modality, template.region
    )

    # Build prompt
    user_content = _build_prompt(template, examples, clinical_context, study_info)

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": ASISTRAD_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": user_content,
        }],
    )

    pre_report = response.content[0].text.strip()
    return pre_report, user_content
