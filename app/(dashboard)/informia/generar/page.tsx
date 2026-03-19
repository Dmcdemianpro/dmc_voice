"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMobileCtx } from "../../layout";
import { useAuthStore } from "@/store/authStore";
import { pacsApi, asistradApi } from "@/lib/api";
import type { Modality, AnatomicalRegion, RadTemplate, AsistRadResponse } from "@/types/asistrad.types";
import type { DicomAnalysisResponse } from "@/types/pacs.types";
import { toast } from "sonner";
import {
  Sparkles, Upload, FileText, Loader2, ArrowLeft, Copy,
  Stethoscope, MapPin, ChevronDown, Star, Send, CheckCircle,
  AlertTriangle, Activity, Microscope, Menu, X,
} from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

const C = {
  bg: "#0d111a", surface: "#161f2e", elevated: "#1e2a3d",
  border: "rgba(0,212,255,0.18)", borderSub: "rgba(148,163,184,0.18)",
  cyan: "#00d4ff", green: "#10b981", red: "#ff4757",
  amber: "#f59e0b", purple: "#a78bfa",
  text: "#f1f5f9", sub: "#b0bfd4", muted: "#7a90aa",
};

type Step = "source" | "analysis" | "template" | "generate" | "result";

export default function InformIAGenerarPage() {
  const { isMobile, toggleMenu } = useMobileCtx();
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL params from PACS
  const studyUid = searchParams.get("study_uid") || "";
  const urlModality = searchParams.get("modality") || "";
  const urlPatient = searchParams.get("patient") || "";
  const urlDesc = searchParams.get("desc") || "";

  // Steps
  const [step, setStep] = useState<Step>(studyUid ? "analysis" : "source");

  // Source
  const [dicomFile, setDicomFile] = useState<File | null>(null);

  // Analysis
  const [analysis, setAnalysis] = useState<DicomAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Template selection
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [regions, setRegions] = useState<AnatomicalRegion[]>([]);
  const [templates, setTemplates] = useState<RadTemplate[]>([]);
  const [selectedModality, setSelectedModality] = useState(urlModality);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<RadTemplate | null>(null);

  // Context
  const [clinicalContext, setClinicalContext] = useState("");
  const [hallazgos, setHallazgos] = useState("");

  // Generation
  const [preReport, setPreReport] = useState<AsistRadResponse | null>(null);
  const [generating, setGenerating] = useState(false);

  // Rating
  const [rating, setRating] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Load modalities
  useEffect(() => {
    asistradApi.getModalities().then(setModalities).catch(() => {});
  }, []);

  // Load regions when modality changes
  useEffect(() => {
    if (selectedModality) {
      asistradApi.getRegions(selectedModality).then(setRegions).catch(() => setRegions([]));
    } else {
      setRegions([]);
    }
  }, [selectedModality]);

  // Load templates when region changes
  useEffect(() => {
    if (selectedModality && selectedRegion) {
      asistradApi.getTemplates(selectedModality, selectedRegion).then(setTemplates).catch(() => setTemplates([]));
    } else {
      setTemplates([]);
    }
  }, [selectedModality, selectedRegion]);

  // Auto-start analysis if study_uid from URL
  useEffect(() => {
    if (studyUid && step === "analysis" && !analysis && !analyzing) {
      // For now, just skip to template selection since we have the study info from URL
      setStep("template");
    }
  }, [studyUid, step, analysis, analyzing]);

  const handleFileUpload = async (file: File) => {
    setDicomFile(file);
    setAnalyzing(true);
    setStep("analysis");
    try {
      const result = await pacsApi.analyzeDicom(file);
      setAnalysis(result);
      // Auto-fill modality from analysis
      if (result.modalidad) {
        const modalityMap: Record<string, string> = {
          "CT": "TC", "MR": "RM", "US": "ECO", "DX": "RX", "CR": "RX",
        };
        setSelectedModality(modalityMap[result.modalidad] || result.modalidad);
      }
      setStep("template");
      toast.success("Análisis DICOM completado");
    } catch {
      toast.error("Error al analizar el archivo DICOM");
      setStep("source");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedModality || !selectedRegion || !selectedTemplate) {
      toast.error("Selecciona modalidad, región y plantilla");
      return;
    }
    setGenerating(true);
    setStep("generate");
    try {
      const studyInfo: Record<string, unknown> = {};
      if (studyUid) studyInfo.study_instance_uid = studyUid;
      if (urlPatient) studyInfo.patient_name = urlPatient;
      if (urlDesc) studyInfo.study_description = urlDesc;
      if (analysis) {
        studyInfo.dicom_analysis = analysis.contexto_texto;
        studyInfo.modalidad_dicom = analysis.modalidad;
        studyInfo.region_dicom = analysis.region;
      }
      if (hallazgos) studyInfo.hallazgos_clinicos = hallazgos;

      const result = await asistradApi.generate({
        modality: selectedModality,
        region: selectedRegion,
        template_id: selectedTemplate.id,
        clinical_context: [
          clinicalContext,
          analysis?.contexto_texto ? `\n--- Análisis DICOM automático ---\n${analysis.contexto_texto}` : "",
          hallazgos ? `\n--- Hallazgos del radiólogo ---\n${hallazgos}` : "",
        ].filter(Boolean).join("\n"),
        study_info: studyInfo,
      });
      setPreReport(result);
      setStep("result");
      toast.success("Pre-informe generado");
    } catch {
      toast.error("Error al generar pre-informe");
      setStep("template");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (preReport) {
      navigator.clipboard.writeText(preReport.pre_report_text);
      toast.success("Copiado al portapapeles");
    }
  };

  const handleRate = async () => {
    const historyId = preReport?.metadata?.history_id;
    if (!historyId || rating === 0) return;
    try {
      await asistradApi.rateHistory(historyId, rating, ratingFeedback || undefined);
      setRatingSubmitted(true);
      toast.success("Calificación guardada");
    } catch {
      toast.error("Error al guardar calificación");
    }
  };

  const stepNumber = { source: 1, analysis: 2, template: 3, generate: 4, result: 5 };
  const steps = [
    { key: "source", label: "Origen" },
    { key: "analysis", label: "Análisis" },
    { key: "template", label: "Plantilla" },
    { key: "generate", label: "Generar" },
    { key: "result", label: "Resultado" },
  ];

  return (
    <div style={{ fontFamily: mono, padding: isMobile ? 16 : 28, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {isMobile && (
          <button onClick={toggleMenu} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, width: 34, height: 34, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "rgba(148,163,184,0.8)",
          }}>
            <Menu size={16} />
          </button>
        )}
        <button onClick={() => router.push("/informia")} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "5px 8px",
          borderRadius: 4, background: "transparent", border: "1px solid rgba(25,33,48,0.8)",
          color: C.muted, fontSize: 10, cursor: "pointer", fontFamily: mono,
        }}>
          <ArrowLeft size={11} /> Volver
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} style={{ color: C.purple }} />
            Generar Informe
          </h1>
        </div>
      </div>

      {/* Study info from URL */}
      {studyUid && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 6,
          background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.15)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Activity size={13} style={{ color: C.purple, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.text }}>{urlPatient || "Estudio vinculado"}</div>
            <div style={{ fontSize: 9, color: C.muted }}>
              {urlModality && `${urlModality} · `}{urlDesc || studyUid}
            </div>
          </div>
        </div>
      )}

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {steps.map((s, i) => {
          const current = stepNumber[step as keyof typeof stepNumber];
          const idx = i + 1;
          const active = idx === current;
          const done = idx < current;
          return (
            <div key={s.key} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}>
              <div style={{
                width: "100%", height: 3, borderRadius: 2,
                background: done ? C.green : active ? C.purple : "rgba(25,33,48,0.8)",
                transition: "background 0.3s",
              }} />
              <span style={{
                fontSize: 8, color: done ? C.green : active ? C.purple : C.muted,
                textTransform: "uppercase", letterSpacing: "0.12em",
              }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step: Source */}
      {step === "source" && (
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>
            Selecciona el origen del estudio
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12,
          }}>
            {/* Upload DICOM */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: 24, borderRadius: 8, cursor: "pointer",
                background: "rgba(139,92,246,0.04)", border: "2px dashed rgba(139,92,246,0.25)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                fontFamily: mono, transition: "border-color 0.15s",
              }}
            >
              <Upload size={24} style={{ color: C.purple }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Subir archivo DICOM</span>
              <span style={{ fontSize: 10, color: C.muted, textAlign: "center" }}>
                Arrastra o selecciona un archivo .dcm
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dcm,.dicom,application/dicom"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />

            {/* Skip to template */}
            <button
              onClick={() => setStep("template")}
              style={{
                padding: 24, borderRadius: 8, cursor: "pointer",
                background: "rgba(0,212,255,0.04)", border: "2px dashed rgba(0,212,255,0.2)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                fontFamily: mono, transition: "border-color 0.15s",
              }}
            >
              <FileText size={24} style={{ color: C.cyan }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Solo texto</span>
              <span style={{ fontSize: 10, color: C.muted, textAlign: "center" }}>
                Generar informe sin análisis DICOM
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Step: Analysis (loading) */}
      {step === "analysis" && analyzing && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2 size={28} style={{ color: C.purple, animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Analizando archivo DICOM...</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            Extrayendo metadatos técnicos y métricas cuantitativas
          </div>
        </div>
      )}

      {/* Step: Template Selection */}
      {step === "template" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* DICOM Analysis summary */}
          {analysis && (
            <div style={{
              padding: 14, borderRadius: 8,
              background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Microscope size={12} style={{ color: C.green }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.green, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Análisis DICOM
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.sub, lineHeight: 1.6 }}>
                <div><strong>Modalidad:</strong> {analysis.modalidad}</div>
                <div><strong>Región:</strong> {analysis.region}</div>
                {analysis.analisis?.advertencias_tecnicas?.length > 0 && (
                  <div style={{ marginTop: 6, color: C.amber }}>
                    <AlertTriangle size={9} style={{ marginRight: 4 }} />
                    {analysis.analisis.advertencias_tecnicas.join("; ")}
                  </div>
                )}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 9, color: C.muted, cursor: "pointer" }}>
                  Ver contexto completo
                </summary>
                <pre style={{
                  fontSize: 9, color: C.sub, marginTop: 6, padding: 8,
                  background: "rgba(0,0,0,0.3)", borderRadius: 4,
                  whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto",
                }}>
                  {analysis.contexto_texto}
                </pre>
              </details>
            </div>
          )}

          {/* Modality */}
          <div>
            <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Stethoscope size={10} /> MODALIDAD *
            </label>
            <select
              value={selectedModality}
              onChange={(e) => { setSelectedModality(e.target.value); setSelectedRegion(""); setSelectedTemplate(null); }}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 6,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                color: C.text, fontSize: 12, fontFamily: mono, cursor: "pointer", outline: "none",
              }}
            >
              <option value="">Seleccionar modalidad...</option>
              {modalities.map((m) => (
                <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
              ))}
            </select>
          </div>

          {/* Region */}
          {selectedModality && (
            <div>
              <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <MapPin size={10} /> REGIÓN ANATÓMICA *
              </label>
              <select
                value={selectedRegion}
                onChange={(e) => { setSelectedRegion(e.target.value); setSelectedTemplate(null); }}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 6,
                  background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                  color: C.text, fontSize: 12, fontFamily: mono, cursor: "pointer", outline: "none",
                }}
              >
                <option value="">Seleccionar región...</option>
                {regions.map((r) => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Template */}
          {selectedRegion && (
            <div>
              <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <FileText size={10} /> PLANTILLA *
              </label>
              {templates.length === 0 ? (
                <div style={{ fontSize: 10, color: C.muted, padding: "12px 0" }}>
                  No hay plantillas para esta combinación.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px",
                        borderRadius: 6, cursor: "pointer",
                        background: selectedTemplate?.id === t.id ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${selectedTemplate?.id === t.id ? "rgba(139,92,246,0.3)" : "rgba(25,33,48,0.8)"}`,
                        fontFamily: mono, transition: "all 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{t.name}</div>
                      {t.description && (
                        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{t.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Clinical context */}
          {selectedTemplate && (
            <>
              <div>
                <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6, display: "block" }}>
                  CONTEXTO CLÍNICO (opcional)
                </label>
                <textarea
                  value={clinicalContext}
                  onChange={(e) => setClinicalContext(e.target.value)}
                  placeholder="Indicación clínica, antecedentes relevantes..."
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 6,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                    color: C.text, fontSize: 11, fontFamily: mono, outline: "none", resize: "vertical",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6, display: "block" }}>
                  HALLAZGOS DEL RADIÓLOGO (opcional)
                </label>
                <textarea
                  value={hallazgos}
                  onChange={(e) => setHallazgos(e.target.value)}
                  placeholder="Describe los hallazgos que observas en las imágenes..."
                  rows={4}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 6,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                    color: C.text, fontSize: 11, fontFamily: mono, outline: "none", resize: "vertical",
                  }}
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  width: "100%", padding: "13px 20px", borderRadius: 8,
                  background: generating ? "rgba(139,92,246,0.03)" : "rgba(139,92,246,0.1)",
                  border: `1px solid ${generating ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.4)"}`,
                  cursor: generating ? "not-allowed" : "pointer",
                  color: generating ? "rgba(139,92,246,0.4)" : C.purple,
                  fontSize: 12, fontWeight: 600, fontFamily: mono,
                  letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all 0.2s",
                }}
              >
                {generating ? (
                  <><Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Generando...</>
                ) : (
                  <><Sparkles size={14} /> Generar Pre-informe</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step: Generating */}
      {step === "generate" && generating && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Sparkles size={28} style={{ color: C.purple, margin: "0 auto 16px" }} />
          <Loader2 size={20} style={{ color: C.purple, animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Generando pre-informe...</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            Claude está redactando el informe basado en la plantilla y el contexto proporcionado
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === "result" && preReport && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Generated report */}
          <div style={{
            borderRadius: 8, overflow: "hidden",
            border: "1px solid rgba(16,185,129,0.25)",
            background: "rgba(16,185,129,0.02)",
          }}>
            <div style={{
              padding: "10px 14px", display: "flex", alignItems: "center", gap: 6,
              background: "rgba(16,185,129,0.06)",
              borderBottom: "1px solid rgba(16,185,129,0.15)",
            }}>
              <CheckCircle size={13} style={{ color: C.green }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.green, letterSpacing: "0.1em", flex: 1, textTransform: "uppercase" }}>
                Pre-informe Generado
              </span>
              <span style={{ fontSize: 9, color: C.muted }}>
                {preReport.template_used}
              </span>
            </div>

            <div style={{
              padding: 16, fontSize: 11.5, color: C.text,
              lineHeight: 1.7, whiteSpace: "pre-wrap",
              maxHeight: 500, overflowY: "auto",
            }}>
              {preReport.pre_report_text}
            </div>

            {/* Copy action */}
            <div style={{
              padding: "10px 14px", display: "flex", gap: 8,
              borderTop: "1px solid rgba(16,185,129,0.15)",
            }}>
              <button onClick={handleCopy} style={{
                flex: 1, padding: "9px 14px", borderRadius: 6,
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                cursor: "pointer", color: C.green,
                fontSize: 10, fontWeight: 600, fontFamily: mono,
                letterSpacing: "0.08em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Copy size={11} /> Copiar al portapapeles
              </button>
              <button onClick={() => { setStep("template"); setPreReport(null); setRating(0); setRatingSubmitted(false); }} style={{
                padding: "9px 14px", borderRadius: 6,
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.2)",
                cursor: "pointer", color: C.purple,
                fontSize: 10, fontWeight: 500, fontFamily: mono,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <Sparkles size={10} /> Regenerar
              </button>
            </div>
          </div>

          {/* Rating */}
          {!ratingSubmitted ? (
            <div style={{
              padding: 14, borderRadius: 8,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(25,33,48,0.8)",
            }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>
                Calificar resultado
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: n <= rating ? C.amber : C.muted,
                      padding: 2, transition: "color 0.15s",
                    }}
                  >
                    <Star size={18} fill={n <= rating ? C.amber : "none"} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={ratingFeedback}
                    onChange={(e) => setRatingFeedback(e.target.value)}
                    placeholder="Comentario opcional..."
                    style={{
                      flex: 1, padding: "7px 10px", borderRadius: 5,
                      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                      color: C.text, fontSize: 10, fontFamily: mono, outline: "none",
                    }}
                  />
                  <button onClick={handleRate} style={{
                    padding: "7px 14px", borderRadius: 5,
                    background: "rgba(245,158,11,0.1)",
                    border: "1px solid rgba(245,158,11,0.25)",
                    cursor: "pointer", color: C.amber,
                    fontSize: 10, fontWeight: 600, fontFamily: mono,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Send size={9} /> Enviar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: 12, borderRadius: 8,
              background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)",
              fontSize: 10, color: C.green, display: "flex", alignItems: "center", gap: 6,
            }}>
              <CheckCircle size={11} /> Calificación guardada. Tu feedback mejora futuras generaciones.
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
