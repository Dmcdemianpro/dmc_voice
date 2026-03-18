import { create } from "zustand";
import type {
  Modality, AnatomicalRegion, RadTemplate, AsistRadResponse,
} from "@/types/asistrad.types";
import { asistradApi } from "@/lib/api";
import { toast } from "sonner";

interface AsistRadState {
  // Data
  modalities: Modality[];
  regions: AnatomicalRegion[];
  templates: RadTemplate[];

  // Selections
  selectedModality: string | null;
  selectedRegion: string | null;
  selectedTemplate: RadTemplate | null;
  clinicalContext: string;

  // Generation
  preReport: AsistRadResponse | null;
  isGenerating: boolean;

  // Panel visibility
  isOpen: boolean;

  // Actions
  loadModalities: () => Promise<void>;
  selectModality: (code: string) => Promise<void>;
  selectRegion: (name: string) => Promise<void>;
  selectTemplate: (template: RadTemplate) => void;
  setClinicalContext: (text: string) => void;
  generatePreReport: (studyInfo?: Record<string, unknown>) => Promise<void>;
  rateResult: (rating: number, feedback?: string) => Promise<void>;
  toggle: () => void;
  reset: () => void;
}

export const useAsistRadStore = create<AsistRadState>()((set, get) => ({
  modalities: [],
  regions: [],
  templates: [],
  selectedModality: null,
  selectedRegion: null,
  selectedTemplate: null,
  clinicalContext: "",
  preReport: null,
  isGenerating: false,
  isOpen: false,

  loadModalities: async () => {
    try {
      const modalities = await asistradApi.getModalities();
      set({ modalities });
    } catch {
      toast.error("Error al cargar modalidades");
    }
  },

  selectModality: async (code) => {
    set({ selectedModality: code, selectedRegion: null, selectedTemplate: null, templates: [], preReport: null });
    try {
      const regions = await asistradApi.getRegions(code);
      set({ regions });
    } catch {
      toast.error("Error al cargar regiones");
    }
  },

  selectRegion: async (name) => {
    const { selectedModality } = get();
    set({ selectedRegion: name, selectedTemplate: null, preReport: null });
    if (!selectedModality) return;
    try {
      const templates = await asistradApi.getTemplates(selectedModality, name);
      set({ templates });
    } catch {
      toast.error("Error al cargar plantillas");
    }
  },

  selectTemplate: (template) => {
    set({ selectedTemplate: template, preReport: null });
  },

  setClinicalContext: (text) => set({ clinicalContext: text }),

  generatePreReport: async (studyInfo) => {
    const { selectedModality, selectedRegion, selectedTemplate, clinicalContext } = get();
    if (!selectedModality || !selectedRegion || !selectedTemplate) {
      toast.error("Selecciona modalidad, región y plantilla");
      return;
    }
    set({ isGenerating: true });
    try {
      const result = await asistradApi.generate({
        modality: selectedModality,
        region: selectedRegion,
        template_id: selectedTemplate.id,
        clinical_context: clinicalContext || undefined,
        study_info: studyInfo,
      });
      set({ preReport: result });
      toast.success("Pre-informe generado");
    } catch {
      toast.error("Error al generar pre-informe");
    } finally {
      set({ isGenerating: false });
    }
  },

  rateResult: async (rating, feedback) => {
    const { preReport } = get();
    const historyId = preReport?.metadata?.history_id;
    if (!historyId) return;
    try {
      await asistradApi.rateHistory(historyId, rating, feedback);
      toast.success("Calificación guardada");
    } catch {
      toast.error("Error al guardar calificación");
    }
  },

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  reset: () => set({
    selectedModality: null,
    selectedRegion: null,
    selectedTemplate: null,
    clinicalContext: "",
    preReport: null,
    isGenerating: false,
    regions: [],
    templates: [],
  }),
}));
