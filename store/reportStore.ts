import { create } from "zustand";
import type { Report, ClaudeResponse } from "@/types/report.types";
import { dictationApi, reportsApi, reportsCreateApi } from "@/lib/api";
import { toast } from "sonner";

interface ReportState {
  currentReport: Report | null;
  transcript: string;
  isProcessing: boolean;
  isRecording: boolean;
  claudeResult: ClaudeResponse | null;
  alerts: Report[];

  setTranscript: (text: string) => void;
  setRecording: (v: boolean) => void;
  processTranscript: (studyId?: string, accessionNumber?: string, fewshotExamples?: unknown[], overrideText?: string) => Promise<void>;
  updateReportText: (text: string) => void;
  saveReport: (text: string) => Promise<void>;
  createManualReport: (text: string, studyId?: string, accessionNumber?: string) => Promise<void>;
  signReport: () => Promise<void>;
  sendToRis: () => Promise<void>;
  generatePdf: () => Promise<void>;
  loadReport: (id: string) => Promise<void>;
  loadAlerts: () => Promise<void>;
  reset: () => void;
}

export const useReportStore = create<ReportState>()((set, get) => ({
  currentReport: null,
  transcript: "",
  isProcessing: false,
  isRecording: false,
  claudeResult: null,
  alerts: [],

  setTranscript: (text) => set({ transcript: text }),
  setRecording: (v) => set({ isRecording: v }),

  processTranscript: async (studyId, accessionNumber, fewshotExamples, overrideText) => {
    const { transcript } = get();
    const textToProcess = overrideText?.trim() || transcript.trim();
    if (!textToProcess) {
      toast.error("No hay texto para procesar");
      return;
    }
    set({ isProcessing: true });
    try {
      const { data: report } = await dictationApi.process(textToProcess, studyId, accessionNumber, fewshotExamples);
      set({
        currentReport: report,
        claudeResult: report.claude_json,
      });
      if (report.has_alert) {
        toast.error(`⚠ ALERTA CRÍTICA: ${report.alert_desc}`, { duration: 10_000 });
      } else {
        toast.success("Informe procesado correctamente");
      }
    } catch (e: unknown) {
      toast.error("Error al procesar el dictado");
      throw e;
    } finally {
      set({ isProcessing: false });
    }
  },

  updateReportText: (text) => {
    // Update local state only — saves happen explicitly via Guardar button
    set((s) => s.currentReport ? { currentReport: { ...s.currentReport, texto_final: text } } : {});
  },

  saveReport: async (text) => {
    const { currentReport } = get();
    if (!currentReport) return;
    const { data } = await reportsApi.update(currentReport.id, { texto_final: text });
    set({ currentReport: data });
    toast.success("Informe guardado");
  },

  createManualReport: async (text, studyId, accessionNumber) => {
    if (!text.trim()) {
      toast.error("No hay texto para guardar");
      return;
    }
    set({ isProcessing: true });
    try {
      const { data } = await reportsCreateApi.createManual({
        raw_transcript: text,
        study_id: studyId,
        accession_number: accessionNumber,
      });
      set({ currentReport: data, claudeResult: data.claude_json });
      toast.success("Informe creado correctamente");
    } catch {
      toast.error("Error al crear el informe");
    } finally {
      set({ isProcessing: false });
    }
  },

  signReport: async () => {
    const { currentReport } = get();
    if (!currentReport) return;
    const { data } = await dictationApi.sign(currentReport.id);
    set({ currentReport: data });
    toast.success("Informe firmado correctamente");
  },

  sendToRis: async () => {
    const { currentReport } = get();
    if (!currentReport) return;
    const { data } = await dictationApi.sendToRis(currentReport.id);
    set({ currentReport: data });
    toast.success("Informe enviado al RIS correctamente");
  },

  generatePdf: async () => {
    const { currentReport } = get();
    if (!currentReport) return;
    const { data } = await reportsApi.generatePdf(currentReport.id);
    const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_${currentReport.id}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("PDF generado y descargado");
  },

  loadReport: async (id) => {
    const { data } = await reportsApi.get(id);
    set({ currentReport: data, claudeResult: data.claude_json });
  },

  loadAlerts: async () => {
    const { data } = await reportsApi.alerts();
    set({ alerts: data });
  },

  reset: () => set({
    currentReport: null, transcript: "", isProcessing: false,
    isRecording: false, claudeResult: null,
  }),
}));
