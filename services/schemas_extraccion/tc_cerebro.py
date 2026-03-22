"""Schema de extracción para TC Cerebro."""

SCHEMA = """{
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
