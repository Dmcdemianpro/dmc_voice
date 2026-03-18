"use client";

import { useEffect, useState } from "react";
import { useAsistRadStore } from "@/store/asistradStore";
import {
  Loader2, Sparkles, ChevronDown, Star, Send as SendIcon,
  Stethoscope, MapPin, FileText, Copy, X,
} from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

const C = {
  bg:       "#0d111a",
  surface:  "#161f2e",
  elevated: "#1e2a3d",
  border:   "rgba(0,212,255,0.18)",
  borderSub:"rgba(148,163,184,0.18)",
  cyan:     "#00d4ff",
  green:    "#10b981",
  red:      "#ff4757",
  amber:    "#f59e0b",
  text:     "#f1f5f9",
  sub:      "#b0bfd4",
  muted:    "#7a90aa",
};

interface AsistRadPanelProps {
  onUsePreReport: (text: string) => void;
  onClose: () => void;
  studyInfo?: Record<string, unknown>;
  isMobile?: boolean;
}

export function AsistRadPanel({ onUsePreReport, onClose, studyInfo, isMobile }: AsistRadPanelProps) {
  const {
    modalities, regions, templates,
    selectedModality, selectedRegion, selectedTemplate,
    clinicalContext, preReport, isGenerating, autoReady,
    loadModalities, selectModality, selectRegion, selectTemplate,
    setClinicalContext, generatePreReport, rateResult, reset,
  } = useAsistRadStore();

  const [ratingValue, setRatingValue] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    loadModalities();
  }, [loadModalities]);

  const handleGenerate = () => generatePreReport(studyInfo);

  const handleUse = () => {
    if (preReport) onUsePreReport(preReport.pre_report_text);
  };

  const handleRate = async () => {
    if (ratingValue > 0) {
      await rateResult(ratingValue, feedbackText || undefined);
      setRatingSubmitted(true);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.surface, fontFamily: mono, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: C.elevated,
        borderBottom: `1px solid ${C.borderSub}`,
        flexShrink: 0,
      }}>
        <Sparkles size={13} style={{ color: C.cyan, flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: C.sub,
          textTransform: "uppercase", letterSpacing: "0.16em",
          flex: 1,
        }}>AsistRad</span>
        <button
          onClick={handleClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.muted, padding: 2, display: "flex",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Auto-detected banner */}
        {autoReady && !preReport && (
          <div style={{
            padding: "10px 12px", borderRadius: 6,
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.25)",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: C.green, letterSpacing: "0.1em" }}>
              DETECCION AUTOMATICA
            </div>
            <div style={{ fontSize: 10.5, color: C.sub, lineHeight: 1.5 }}>
              Se detecto <strong style={{ color: C.text }}>{selectedModality}</strong> — <strong style={{ color: C.text }}>{selectedRegion}</strong> desde el worklist.
              Plantilla <strong style={{ color: C.cyan }}>{selectedTemplate?.name}</strong> seleccionada.
            </div>
            <div style={{ fontSize: 9.5, color: C.muted }}>
              Puedes cambiar la seleccion abajo o presionar directamente Generar.
            </div>
          </div>
        )}


        {/* Step 1: Modality */}
        <div>
          <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <Stethoscope size={10} /> MODALIDAD
          </label>
          <select
            value={selectedModality || ""}
            onChange={(e) => e.target.value && selectModality(e.target.value)}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 5,
              background: C.elevated, border: `1px solid ${C.borderSub}`,
              color: C.text, fontSize: 11, fontFamily: mono,
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="" style={{ background: C.elevated }}>Seleccionar modalidad...</option>
            {modalities.map((m) => (
              <option key={m.code} value={m.code} style={{ background: C.elevated }}>
                {m.code} — {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: Region */}
        {selectedModality && (
          <div>
            <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <MapPin size={10} /> REGION ANATOMICA
            </label>
            <select
              value={selectedRegion || ""}
              onChange={(e) => e.target.value && selectRegion(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 5,
                background: C.elevated, border: `1px solid ${C.borderSub}`,
                color: C.text, fontSize: 11, fontFamily: mono,
                cursor: "pointer", outline: "none",
              }}
            >
              <option value="" style={{ background: C.elevated }}>Seleccionar region...</option>
              {regions.map((r) => (
                <option key={r.name} value={r.name} style={{ background: C.elevated }}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Template */}
        {selectedRegion && (
          <div>
            <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <FileText size={10} /> PLANTILLA
            </label>
            {templates.length === 0 ? (
              <div style={{ fontSize: 10, color: C.muted, padding: "8px 0" }}>
                No hay plantillas disponibles para esta combinacion.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    style={{
                      width: "100%", textAlign: "left", padding: "8px 10px",
                      borderRadius: 5, cursor: "pointer",
                      background: selectedTemplate?.id === t.id
                        ? "rgba(0,212,255,0.1)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selectedTemplate?.id === t.id
                        ? "rgba(0,212,255,0.35)"
                        : C.borderSub}`,
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

        {/* Step 4: Clinical Context */}
        {selectedTemplate && (
          <div>
            <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6, display: "block" }}>
              CONTEXTO CLINICO (OPCIONAL)
            </label>
            <textarea
              value={clinicalContext}
              onChange={(e) => setClinicalContext(e.target.value)}
              placeholder="Indicacion clinica, antecedentes..."
              rows={3}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 5,
                background: C.elevated, border: `1px solid ${C.borderSub}`,
                color: C.text, fontSize: 11, fontFamily: mono,
                outline: "none", resize: "vertical",
              }}
            />
          </div>
        )}

        {/* Generate button */}
        {selectedTemplate && (
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              width: "100%", padding: "11px 16px",
              background: isGenerating ? "rgba(0,212,255,0.03)" : "rgba(0,212,255,0.1)",
              border: `1px solid ${isGenerating ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.4)"}`,
              borderRadius: 6, cursor: isGenerating ? "not-allowed" : "pointer",
              color: isGenerating ? "rgba(0,212,255,0.35)" : C.cyan,
              fontSize: 11, fontWeight: 600, fontFamily: mono,
              letterSpacing: "0.1em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}
          >
            {isGenerating ? (
              <><Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} /> Generando...</>
            ) : (
              <><Sparkles size={12} /> Generar Pre-informe</>
            )}
          </button>
        )}

        {/* Pre-report preview */}
        {preReport && (
          <div style={{
            borderRadius: 6, overflow: "hidden",
            border: `1px solid rgba(16,185,129,0.3)`,
            background: "rgba(16,185,129,0.03)",
          }}>
            <div style={{
              padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
              background: "rgba(16,185,129,0.06)",
              borderBottom: "1px solid rgba(16,185,129,0.15)",
            }}>
              <FileText size={11} style={{ color: C.green }} />
              <span style={{ fontSize: 9.5, fontWeight: 600, color: C.green, letterSpacing: "0.1em", flex: 1 }}>
                PRE-INFORME GENERADO
              </span>
              <span style={{ fontSize: 9, color: C.muted }}>
                {preReport.template_used}
              </span>
            </div>

            <div style={{
              padding: 12, fontSize: 11, color: C.text,
              lineHeight: 1.6, maxHeight: 300, overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}>
              {preReport.pre_report_text}
            </div>

            {/* Actions */}
            <div style={{
              padding: "8px 12px", display: "flex", gap: 6,
              borderTop: "1px solid rgba(16,185,129,0.15)",
            }}>
              <button
                onClick={handleUse}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 5,
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.35)",
                  cursor: "pointer", color: C.green,
                  fontSize: 10, fontWeight: 600, fontFamily: mono,
                  letterSpacing: "0.1em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Copy size={11} /> Usar en editor
              </button>
            </div>

            {/* Rating */}
            {!ratingSubmitted ? (
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.borderSub}` }}>
                <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 6, fontWeight: 600, letterSpacing: "0.1em" }}>
                  CALIFICAR RESULTADO
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRatingValue(n)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: n <= ratingValue ? C.amber : C.muted,
                        padding: 2, transition: "color 0.15s",
                      }}
                    >
                      <Star size={16} fill={n <= ratingValue ? C.amber : "none"} />
                    </button>
                  ))}
                </div>
                {ratingValue > 0 && (
                  <>
                    <input
                      type="text"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Comentario opcional..."
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 4,
                        background: C.elevated, border: `1px solid ${C.borderSub}`,
                        color: C.text, fontSize: 10, fontFamily: mono,
                        outline: "none", marginBottom: 6,
                      }}
                    />
                    <button
                      onClick={handleRate}
                      style={{
                        padding: "5px 10px", borderRadius: 4,
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        cursor: "pointer", color: C.amber,
                        fontSize: 9.5, fontWeight: 600, fontFamily: mono,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <SendIcon size={9} /> Enviar
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: "8px 12px", fontSize: 10, color: C.green, borderTop: `1px solid ${C.borderSub}` }}>
                Calificacion guardada. Gracias.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
