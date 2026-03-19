export interface PacsStudy {
  study_instance_uid: string;
  study_date: string;
  study_time: string;
  accession_number: string;
  modalities: string;
  study_description: string;
  patient_name: string;
  patient_id: string;
  patient_birth_date: string;
  patient_sex: string;
  num_series: string;
  num_instances: string;
  viewer_url: string;
}

export interface PacsStudiesResponse {
  count: number;
  results: PacsStudy[];
}

export interface DicomAnalysis {
  modalidad: string;
  metadata_tecnica: Record<string, string>;
  analisis_cuantitativo: {
    tipo: string;
    estadisticas_globales?: Record<string, number>;
    distribucion_tejidos?: Record<string, { porcentaje: number; hu_media: number | null }>;
    hallazgos_automaticos: string[];
    [key: string]: unknown;
  } | null;
  advertencias_tecnicas: string[];
}

export interface DicomAnalysisResponse {
  analisis: DicomAnalysis;
  contexto_texto: string;
  modalidad: string;
  region: string;
}

export interface StudyReport {
  id: string;
  study_instance_uid: string;
  report_status: "draft" | "preliminary" | "final" | "amended";
  report_title: string;
  report_body: string;
  report_impression: string;
  was_informia: boolean;
}

export interface PacsHealthResponse {
  status: "ok" | "error";
  pacs_url?: string;
  detail?: string;
}
