"""Schema de extracción genérico para modalidades/regiones sin schema específico."""

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
