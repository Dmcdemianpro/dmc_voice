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

ASISTRAD_SYSTEM_PROMPT = """Eres un asistente de redacción de informes radiológicos para el sistema de salud chileno.
Tu rol es generar un PRE-INFORME estructurado a partir de una plantilla proporcionada.

=== REGLAS ===
1. Usa la plantilla proporcionada como estructura base del informe.
2. Rellena las secciones con texto médico formal en español.
3. Las variables marcadas con {{variable}} deben ser reemplazadas con texto descriptivo apropiado.
4. Si se proporcionan ejemplos de informes anteriores similares, úsalos como referencia de estilo y contenido.
5. Si se proporciona contexto clínico, incorpóralo en la indicación clínica y considera los hallazgos relevantes.
6. NUNCA inventes datos del paciente (nombre, RUT, edad, etc.).
7. Usa terminología SNOMED CT / CIE-10 donde sea apropiado.
8. El pre-informe debe ser texto limpio y editable, NO JSON.
9. Mantén el formato y secciones de la plantilla.
10. Marca con [COMPLETAR] las áreas que requieren información específica del estudio.

=== FORMATO DE SALIDA ===
Responde ÚNICAMENTE con el texto del pre-informe, sin explicaciones adicionales ni markdown."""


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
