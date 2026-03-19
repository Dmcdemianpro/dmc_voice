import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type { Report, ReportListOut, WorklistItem, User, AuditLog, ClaudeResponse } from "@/types/report.types";
import type {
  RadTemplate, RadTemplateVersion, RadReportHistory,
  AsistRadRequest, AsistRadResponse, Modality, AnatomicalRegion,
  RadTemplateCreate, RadTemplateUpdate,
} from "@/types/asistrad.types";

const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: 401 → refresh ──────────────────────────────────────
let refreshing = false;
let queue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({
            resolve: (token) => { original.headers.Authorization = `Bearer ${token}`; resolve(api(original)); },
            reject,
          });
        });
      }
      original._retry = true;
      refreshing = true;
      try {
        const rt = localStorage.getItem("refresh_token");
        if (!rt) throw new Error("No refresh token");
        // Use relative URL so Next.js proxy forwards it correctly
        const res = await axios.post("/api/v1/auth/refresh", { refresh_token: rt });
        const { access_token, refresh_token: newRt } = res.data;
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", newRt);
        queue.forEach((p) => p.resolve(access_token));
        queue = [];
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch (e) {
        queue.forEach((p) => p.reject(e));
        queue = [];
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("ris-auth"); // Clear zustand persist data too
        if (typeof window !== "undefined") window.location.href = "/login";
        return Promise.reject(e);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ── API methods ───────────────────────────────────────────────────────────────

export const authApi = {
  login: (rut: string, password: string) =>
    api.post<{ access_token: string; refresh_token: string; user: User }>("/api/v1/auth/login", { rut, password }),
  logout: (refresh_token: string) =>
    api.post("/api/v1/auth/logout", { refresh_token }),
  me: () => api.get<User>("/api/v1/auth/me"),
};

export const dictationApi = {
  process: (transcript: string, study_id?: string, accession_number?: string, fewshot_examples?: unknown[]) =>
    api.post<Report>("/api/v1/process-dictation", { transcript, study_id, accession_number, fewshot_examples }),
  sign: (reportId: string) =>
    api.patch<Report>(`/api/v1/reports/${reportId}/sign`),
  sendToRis: (reportId: string) =>
    api.post<Report>(`/api/v1/reports/${reportId}/send-ris`),
  transcribeWhisper: (audioBlob: Blob) => {
    const fd = new FormData();
    fd.append("audio", audioBlob, "dictado.webm");
    return api.post<{ text: string }>("/api/v1/transcribe-whisper", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const reportsApi = {
  // No trailing slashes — Next.js 308-redirects trailing-slash URLs before the rewrite,
  // causing Authorization header to be dropped on the redirect.
  list: (page = 1, per_page = 20, status?: string) =>
    api.get<ReportListOut>("/api/v1/reports", { params: { page, per_page, status } }),
  get: (id: string) => api.get<Report>(`/api/v1/reports/${id}`),
  update: (id: string, data: { texto_final?: string; status?: string }) =>
    api.patch<Report>(`/api/v1/reports/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/reports/${id}`),
  alerts: () => api.get<Report[]>("/api/v1/reports/alerts"),
  generatePdf: (id: string) =>
    api.post(`/api/v1/reports/${id}/pdf`, null, { responseType: "blob" }),
  invalidate: (id: string, password: string, reason?: string) =>
    api.patch<Report>(`/api/v1/reports/${id}/invalidate`, { password, reason }),
  assign: (id: string, assigned_to_id: string) =>
    api.patch<Report>(`/api/v1/reports/${id}/assign`, { assigned_to_id }),
  linkWorklist: (id: string, worklist_id: string) =>
    api.patch<Report>(`/api/v1/reports/${id}/link-worklist`, { worklist_id }),
};

export const worklistApi = {
  list: (status?: string, modalidad?: string) =>
    api.get<WorklistItem[]>("/api/v1/worklist", { params: { status, modalidad } }),
  get: (id: string) => api.get<WorklistItem>(`/api/v1/worklist/${id}`),
  assign: (id: string, assigned_to_id: string | null) =>
    api.patch<WorklistItem>(`/api/v1/worklist/${id}/assign`, { assigned_to_id }),
  toggleImages: (id: string) =>
    api.patch<WorklistItem>(`/api/v1/worklist/${id}/toggle-images`),
  create: (data: {
    accession_number: string;
    study_id?: string;
    // Estudio
    modalidad?: string; region?: string; scheduled_at?: string;
    medico_derivador?: string; servicio_solicitante?: string;
    // Demografía chilena
    patient_name?: string; patient_rut?: string; patient_dob?: string;
    patient_sex?: string; patient_phone?: string; patient_email?: string;
    patient_address?: string; patient_commune?: string; patient_region?: string;
    prevision?: string; isapre_nombre?: string;
  }) => api.post<WorklistItem>("/api/v1/worklist", data),
};

export interface PatientResult {
  patient_rut: string | null; patient_name: string | null; patient_dob: string | null;
  patient_sex: string | null; patient_phone: string | null; patient_email: string | null;
  patient_address: string | null; patient_commune: string | null; patient_region: string | null;
  prevision: string | null; isapre_nombre: string | null;
}

export const patientsApi = {
  search: (q: string) => api.get<PatientResult[]>("/api/v1/patients/search", { params: { q } }),
};

export const reportsCreateApi = {
  createManual: (data: { study_id?: string; accession_number?: string; raw_transcript: string }) =>
    api.post<Report>("/api/v1/reports", data),
};

export interface ClinicSettings {
  institution_name: string;
  institution_subtitle: string;
  report_title: string;
  footer_text?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export const adminApi = {
  users: () => api.get<User[]>("/api/v1/admin/users"),
  createUser: (data: { rut: string; email: string; full_name: string; role: string; password: string; institution?: string }) =>
    api.post<User>("/api/v1/admin/users", data),
  updateUser: (id: string, data: Partial<User>) => api.patch<User>(`/api/v1/admin/users/${id}`, data),
  deactivateUser: (id: string) => api.delete(`/api/v1/admin/users/${id}`),
  audit: (page = 1, per_page = 50, action?: string) =>
    api.get("/api/v1/admin/audit", { params: { page, per_page, action } }),
  stats: () => api.get<{
    total_reports: number; total_alerts: number;
    total_firmados: number; total_enviados: number; active_users: number;
  }>("/api/v1/admin/stats"),
  getSettings: () => api.get<ClinicSettings>("/api/v1/admin/settings"),
  updateSettings: (data: Partial<ClinicSettings>) => api.put<ClinicSettings>("/api/v1/admin/settings", data),
};

// ── Feedback Loop + Few-Shot + Training ───────────────────────────────────────

export interface SimilarReportResult {
  example_id: string;
  transcript: string;
  corrected_text: string;
  modalidad: string | null;
  region_anatomica: string | null;
  similarity_score: number;
}

export interface TrainingStats {
  total_sessions: number;
  total_correction_pairs: number;
  total_training_examples: number;
  validated_examples: number;
  avg_diff_score: number | null;
  avg_time_to_sign_seconds: number | null;
  pairs_by_modalidad: Record<string, number>;
  diff_score_distribution: { range: string; count: number }[];
  quality_over_time: { date: string; avg_quality: number; count: number }[];
  wer_history: { date: string; wer_before: number; wer_after: number }[];
}

export const feedbackApi = {
  startSession: (data: {
    report_id: string;
    audio_duration_seconds?: number | null;
    transcript_length?: number;
  }) => api.post<{ id: string; report_id: string; started_at: string }>(
    "/api/v1/feedback/sessions", data
  ).then(r => r.data),

  saveCorrection: (data: {
    report_id: string;
    session_id?: string;
    original_text: string;
    corrected_text: string;
    modalidad?: string;
    region_anatomica?: string;
    raw_transcript?: string;
    edit_count?: number;
    keystrokes?: number;
    time_to_sign_seconds?: number;
    audio_duration_seconds?: number;
  }) => api.post("/api/v1/feedback/corrections", data).then(r => r.data),

  findSimilar: (transcript: string, n = 5, modalidad?: string) =>
    api.get<SimilarReportResult[]>("/api/v1/feedback/similar", {
      params: { transcript, n, modalidad },
    }).then(r => r.data),

  getExamples: (params?: { validated_only?: boolean; for_finetune?: boolean; page?: number }) =>
    api.get("/api/v1/feedback/examples", { params }).then(r => r.data),

  validateExample: (id: string, is_validated: boolean, used_for_finetune?: boolean) =>
    api.patch(`/api/v1/feedback/examples/${id}`, { is_validated, used_for_finetune }).then(r => r.data),

  getStats: () => api.get<TrainingStats>("/api/v1/feedback/stats").then(r => r.data),

  getCorrections: (params?: { modalidad?: string; page?: number }) =>
    api.get("/api/v1/feedback/corrections", { params }).then(r => r.data),
};

// ── AsistRad — Pre-Informe Asistido ─────────────────────────────────────────

export const asistradApi = {
  // Modalities & Regions
  getModalities: () => api.get<Modality[]>("/api/v1/asistrad/modalities").then(r => r.data),
  getRegions: (modality?: string) =>
    api.get<AnatomicalRegion[]>("/api/v1/asistrad/regions", { params: { modality } }).then(r => r.data),

  // Templates
  getTemplates: (modality?: string, region?: string) =>
    api.get<RadTemplate[]>("/api/v1/asistrad/templates", { params: { modality, region } }).then(r => r.data),
  getTemplate: (id: string) =>
    api.get<RadTemplate>(`/api/v1/asistrad/templates/${id}`).then(r => r.data),
  createTemplate: (data: RadTemplateCreate) =>
    api.post<RadTemplate>("/api/v1/asistrad/templates", data).then(r => r.data),
  updateTemplate: (id: string, data: RadTemplateUpdate) =>
    api.patch<RadTemplate>(`/api/v1/asistrad/templates/${id}`, data).then(r => r.data),
  deleteTemplate: (id: string) =>
    api.delete(`/api/v1/asistrad/templates/${id}`).then(r => r.data),
  getTemplateVersions: (id: string) =>
    api.get<RadTemplateVersion[]>(`/api/v1/asistrad/templates/${id}/versions`).then(r => r.data),

  // Generate
  generate: (data: AsistRadRequest) =>
    api.post<AsistRadResponse>("/api/v1/asistrad/generate", data).then(r => r.data),

  // History & Rating
  rateHistory: (historyId: string, rating: number, feedback?: string) =>
    api.patch<RadReportHistory>(`/api/v1/asistrad/history/${historyId}/rating`, { rating, feedback }).then(r => r.data),
};

// ── PACS — DCM4CHEE DICOMweb ────────────────────────────────────────────────

import type { PacsStudiesResponse, PacsHealthResponse, DicomAnalysisResponse } from "@/types/pacs.types";

export const pacsApi = {
  health: () =>
    api.get<PacsHealthResponse>("/api/v1/pacs/health").then(r => r.data),

  searchStudies: (params?: {
    patient_name?: string;
    patient_id?: string;
    study_date?: string;
    modality?: string;
    accession_number?: string;
    study_description?: string;
    limit?: number;
    offset?: number;
  }) =>
    api.get<PacsStudiesResponse>("/api/v1/pacs/studies", { params }).then(r => r.data),

  getStudy: (studyUid: string) =>
    api.get(`/api/v1/pacs/studies/${studyUid}`).then(r => r.data),

  getViewerUrl: (studyUid: string) =>
    api.get<{ viewer_url: string; study_instance_uid: string }>(
      `/api/v1/pacs/studies/${studyUid}/viewer-url`
    ).then(r => r.data),

  getWorklist: (modality?: string) =>
    api.get("/api/v1/pacs/worklist", { params: { modality } }).then(r => r.data),

  analyzeDicom: (file: File) => {
    const form = new FormData();
    form.append("dicom_file", file);
    return api.post<DicomAnalysisResponse>("/api/v1/pacs/analizar-dicom", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    }).then(r => r.data);
  },
};

export default api;
