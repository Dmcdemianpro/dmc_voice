export interface Modality {
  code: string;
  name: string;
}

export interface AnatomicalRegion {
  name: string;
}

export interface RadTemplate {
  id: string;
  modality: string;
  region: string;
  name: string;
  description: string | null;
  template_text: string;
  variables: Record<string, unknown> | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RadTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  template_text: string;
  variables: Record<string, unknown> | null;
  created_at: string;
}

export interface RadReportHistory {
  id: string;
  report_id: string | null;
  template_id: string;
  user_id: string;
  modality: string;
  region: string;
  clinical_context: string | null;
  prompt_sent: string;
  response_received: string;
  rating: number | null;
  feedback: string | null;
  created_at: string;
}

export interface AsistRadRequest {
  modality: string;
  region: string;
  template_id?: string;
  clinical_context?: string;
  study_info?: Record<string, unknown>;
}

export interface AsistRadResponse {
  pre_report_text: string;
  template_used: string;
  metadata: {
    history_id: string;
    template_id?: string;
    modality: string;
    region: string;
    findings_json?: Record<string, unknown>;
    finding_category?: string;
  } | null;
}

export interface RadTemplateCreate {
  modality: string;
  region: string;
  name: string;
  description?: string;
  template_text: string;
  variables?: Record<string, unknown>;
}

export interface RadTemplateUpdate {
  name?: string;
  description?: string;
  template_text?: string;
  variables?: Record<string, unknown>;
  is_active?: boolean;
}
