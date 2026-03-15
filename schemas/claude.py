from pydantic import BaseModel
from typing import Optional, List, Any


class FewshotExample(BaseModel):
    """Ejemplo similar inyectado en el user message de Claude para few-shot learning."""
    transcript: str
    corrected_text: str
    modalidad: Optional[str] = None
    region_anatomica: Optional[str] = None
    similarity_score: float = 0.0


class ProcessDictationRequest(BaseModel):
    transcript: str
    study_id: Optional[str] = None
    accession_number: Optional[str] = None
    fewshot_examples: Optional[List[Any]] = None  # lista de FewshotExample


class ClaudeMetadata(BaseModel):
    version: str
    modelo: str
    timestamp_procesamiento: str
    confianza_transcripcion: str  # ALTA | MEDIA | BAJA
    advertencias: List[str] = []


class ClaudeEstudio(BaseModel):
    modalidad: Optional[str] = None
    modalidad_loinc: Optional[str] = None
    region_anatomica: Optional[str] = None
    lateralidad: Optional[str] = None
    proyecciones: List[str] = []
    contraste: Optional[str] = None
    indicacion_clinica: Optional[str] = None
    numero_estudio: Optional[str] = None


class ClaudeHallazgo(BaseModel):
    id: str
    descripcion: str
    region: Optional[str] = None
    caracteristicas: Optional[str] = None
    severidad: Optional[str] = None
    snomed_code: Optional[str] = None
    snomed_display: Optional[str] = None
    es_critico: bool = False


class ClaudeDiagnostico(BaseModel):
    id: str
    diagnostico: str
    certeza: Optional[str] = None
    snomed_code: Optional[str] = None
    snomed_display: Optional[str] = None
    loinc_code: Optional[str] = None
    cie10_code: Optional[str] = None
    cie10_descripcion: Optional[str] = None


class ClaudeRecomendaciones(BaseModel):
    texto: List[str] = []
    follow_up_recomendado: bool = False
    urgencia_seguimiento: Optional[str] = None
    correlacion_clinica: Optional[str] = None


class ClaudeAlertaCritica(BaseModel):
    activa: bool = False
    descripcion: Optional[str] = None
    accion_requerida: Optional[str] = None
    hallazgo_id: Optional[str] = None
    timestamp_deteccion: Optional[str] = None


class ClaudeResponse(BaseModel):
    metadata: ClaudeMetadata
    estudio: ClaudeEstudio
    tecnica: Optional[dict] = None
    hallazgos: List[ClaudeHallazgo] = []
    impresion_diagnostica: List[ClaudeDiagnostico] = []
    recomendaciones: ClaudeRecomendaciones
    alerta_critica: ClaudeAlertaCritica
    fhir_diagnostic_report: Optional[dict] = None
    texto_informe_final: Optional[str] = None
