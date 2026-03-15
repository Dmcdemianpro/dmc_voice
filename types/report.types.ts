export interface ClaudeMetadata {
  version: string;
  modelo: string;
  timestamp_procesamiento: string;
  confianza_transcripcion: "ALTA" | "MEDIA" | "BAJA";
  advertencias: string[];
}

export interface ClaudeEstudio {
  modalidad: string | null;
  modalidad_loinc: string | null;
  region_anatomica: string | null;
  lateralidad: string | null;
  proyecciones: string[];
  contraste: string | null;
  indicacion_clinica: string | null;
  numero_estudio: string | null;
}

export interface ClaudeHallazgo {
  id: string;
  descripcion: string;
  region: string | null;
  caracteristicas: string | null;
  severidad: "NORMAL" | "LEVE" | "MODERADO" | "SEVERO" | "CRITICO" | null;
  snomed_code: string | null;
  snomed_display: string | null;
  es_critico: boolean;
}

export interface ClaudeDiagnostico {
  id: string;
  diagnostico: string;
  certeza: "DEFINITIVO" | "PROBABLE" | "POSIBLE" | "DESCARTADO" | null;
  snomed_code: string | null;
  snomed_display: string | null;
  loinc_code: string | null;
  cie10_code: string | null;
  cie10_descripcion: string | null;
}

export interface ClaudeRecomendaciones {
  texto: string[];
  follow_up_recomendado: boolean;
  urgencia_seguimiento: "NO_REQUIERE" | "ELECTIVO" | "PREFERENTE" | "URGENTE" | "INMEDIATO" | null;
  correlacion_clinica: string | null;
}

export interface ClaudeAlertaCritica {
  activa: boolean;
  descripcion: string | null;
  accion_requerida: string | null;
  hallazgo_id: string | null;
  timestamp_deteccion: string | null;
}

export interface ClaudeResponse {
  metadata: ClaudeMetadata;
  estudio: ClaudeEstudio;
  tecnica: { descripcion: string } | null;
  hallazgos: ClaudeHallazgo[];
  impresion_diagnostica: ClaudeDiagnostico[];
  recomendaciones: ClaudeRecomendaciones;
  alerta_critica: ClaudeAlertaCritica;
  fhir_diagnostic_report: Record<string, unknown> | null;
  texto_informe_final: string | null;
}

export interface Report {
  id: string;
  user_id: string;
  study_id: string | null;
  accession_number: string | null;
  status: "BORRADOR" | "EN_REVISION" | "FIRMADO" | "ENVIADO";
  modalidad: string | null;
  region_anatomica: string | null;
  lateralidad: string | null;
  raw_transcript: string | null;
  claude_json: ClaudeResponse | null;
  fhir_json: Record<string, unknown> | null;
  texto_final: string | null;
  has_alert: boolean;
  alert_desc: string | null;
  pdf_url: string | null;
  signed_at: string | null;
  signed_by_id: string | null;
  signed_by_name: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  sent_to_ris_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  // Demografía del paciente (denormalizado desde WorklistItem)
  patient_name: string | null;
  patient_rut: string | null;
  patient_dob: string | null;
  patient_sex: "M" | "F" | "I" | null;
  patient_phone: string | null;
  patient_email: string | null;
}

export interface WorklistItem {
  id: string;
  accession_number: string;
  study_id: string | null;
  // Estudio
  modalidad: string | null;
  region: string | null;                // región anatómica
  scheduled_at: string | null;
  medico_derivador: string | null;
  servicio_solicitante: string | null;
  // Demografía
  patient_name: string | null;
  patient_rut: string | null;
  patient_dob: string | null;
  patient_sex: "M" | "F" | "I" | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_address: string | null;
  patient_commune: string | null;
  patient_region: string | null;        // región administrativa Chile
  // Previsión
  prevision: "FONASA_A" | "FONASA_B" | "FONASA_C" | "FONASA_D" | "ISAPRE" | "PARTICULAR" | "OTRO" | null;
  isapre_nombre: string | null;
  // Trazabilidad
  source: "MANUAL" | "HL7" | "FHIR" | "API";
  status: string;
  report_id: string | null;
  received_at: string | null;
  // Asignación
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  // Imágenes
  has_images: boolean;
}

export interface User {
  id: string;
  rut: string;
  email: string;
  full_name: string;
  role: "RADIOLOGO" | "JEFE_SERVICIO" | "ADMIN" | "TECNOLOGO";
  institution: string | null;
  firma_url: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  report_id: string | null;
  ip_address: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ReportListOut {
  items: Report[];
  total: number;
  page: number;
  per_page: number;
}
