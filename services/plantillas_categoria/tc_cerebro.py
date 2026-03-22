"""Plantillas de categoría para TC Cerebro — extraídas de asistrad_service.py."""

TEMPLATES: dict[str, str] = {
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
