"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useRef, Suspense, useState } from "react";
import { VoiceRecorder } from "@/components/dictation/VoiceRecorder";
import { TranscriptPanel } from "@/components/dictation/TranscriptPanel";
import { ReportEditor } from "@/components/dictation/ReportEditor";
import { AlertBanner } from "@/components/dictation/AlertBanner";
import { DiffViewer } from "@/components/dictation/DiffViewer";
import { useReportStore } from "@/store/reportStore";
import { useFeedbackCapture } from "@/hooks/useFeedbackCapture";
import { Loader2, PenLine, Send, FileDown, Mic, ChevronRight, CheckCircle, AlertTriangle, ChevronDown, BrainCircuit, GitCompare } from "lucide-react";
import Link from "next/link";

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

function PanelCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.borderSub}`,
      borderRadius: 8,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ icon: Icon, label, right }: {
  icon: React.ElementType;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px",
      background: C.elevated,
      borderBottom: `1px solid ${C.borderSub}`,
      flexShrink: 0,
    }}>
      <Icon size={13} style={{ color: C.cyan, flexShrink: 0 }} />
      <span style={{
        fontSize: 10, fontWeight: 600, color: C.sub,
        textTransform: "uppercase" as const, letterSpacing: "0.16em",
      }}>{label}</span>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

function DictationContent() {
  const params = useParams<{ studyId: string }>();
  const searchParams = useSearchParams();
  const {
    transcript, isProcessing, isRecording,
    currentReport, claudeResult,
    setTranscript, processTranscript,
    updateReportText, signReport, sendToRis, generatePdf,
  } = useReportStore();

  const studyId = params.studyId !== "new" ? params.studyId : undefined;
  const accessionNumber = searchParams.get("accession") ?? undefined;
  const patientName = searchParams.get("patient") ?? undefined;
  const modalidad = searchParams.get("modalidad") ?? undefined;
  const region = searchParams.get("region") ?? undefined;

  const fb = useFeedbackCapture({
    reportId: currentReport?.id ?? null,
    originalText: claudeResult?.texto_informe_final ?? "",
    transcript,
    modalidad: claudeResult?.estudio?.modalidad ?? undefined,
    regionAnatomica: claudeResult?.estudio?.region_anatomica ?? undefined,
  });

  const editorTextRef = useRef<string>(currentReport?.texto_final ?? "");
  const [warningsOpen, setWarningsOpen] = useState(true);
  const [diffOpen, setDiffOpen] = useState(false);

  // Live transcript → editor: mientras no hay informe generado, el dictado
  // fluye directamente al editor para que el radiólogo pueda corregir en vivo.
  const handleTranscript = useCallback((text: string) => {
    setTranscript(text);
    if (!currentReport) {
      editorTextRef.current = text;
      updateReportText(text);
    }
  }, [setTranscript, updateReportText, currentReport]);

  // Usa el contenido del editor (posiblemente editado) como input para Claude
  const handleProcess = useCallback(async () => {
    const textToProcess = editorTextRef.current || transcript;
    const examples = await fb.getSimilarExamples(textToProcess);
    await processTranscript(studyId, accessionNumber, examples.length ? examples : undefined, textToProcess);
  }, [fb, transcript, processTranscript, studyId, accessionNumber]);

  const handleEditorChange = useCallback((text: string) => {
    editorTextRef.current = text;
    fb.onTextChange(text);
    updateReportText(text);
  }, [fb, updateReportText]);

  const handleSign = useCallback(async () => {
    await fb.onSign(editorTextRef.current || currentReport?.texto_final || "");
    await signReport();
  }, [fb, currentReport, signReport]);

  const statusColor: Record<string, string> = {
    BORRADOR:    C.muted,
    EN_REVISION: C.amber,
    FIRMADO:     C.green,
    ENVIADO:     C.cyan,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: mono, background: C.bg }}>

      {/* ── Header ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: "0 20px",
        background: C.surface,
        borderBottom: `1px solid ${C.borderSub}`,
        gap: 8,
      }}>
        <Link href="/worklist" style={{
          fontSize: 11, color: C.muted, textDecoration: "none",
          display: "flex", alignItems: "center", gap: 4,
          transition: "color 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget.style.color = C.sub)}
          onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
        >
          Worklist
        </Link>
        <ChevronRight size={12} style={{ color: C.muted }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mic size={13} style={{ color: C.cyan }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Dictado de Informe</span>
        </div>

        {/* Study info pills */}
        <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
          {accessionNumber && (
            <span style={{
              fontSize: 9.5, padding: "3px 9px",
              background: "rgba(0,212,255,0.06)",
              border: `1px solid rgba(0,212,255,0.18)`,
              borderRadius: 4, color: C.cyan, letterSpacing: "0.08em",
            }}>
              {accessionNumber}
            </span>
          )}
          {modalidad && (
            <span style={{
              fontSize: 9.5, padding: "3px 9px",
              background: "rgba(148,163,184,0.06)",
              border: `1px solid rgba(148,163,184,0.15)`,
              borderRadius: 4, color: C.sub, letterSpacing: "0.08em",
            }}>
              {modalidad}
            </span>
          )}
          {patientName && (
            <span style={{ fontSize: 11, color: C.sub }}>· {patientName}</span>
          )}
          {region && (
            <span style={{ fontSize: 11, color: C.muted }}>· {region}</span>
          )}
        </div>

        {/* Status badge */}
        {currentReport && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {fb.sessionId && (
              <span style={{ fontSize: 9, color: C.red, letterSpacing: "0.1em" }}>● REC</span>
            )}
            <span style={{
              fontSize: 9.5, padding: "3px 10px",
              background: `${statusColor[currentReport.status] ?? C.muted}15`,
              border: `1px solid ${statusColor[currentReport.status] ?? C.muted}35`,
              borderRadius: 4,
              color: statusColor[currentReport.status] ?? C.muted,
              fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const,
            }}>
              {currentReport.status}
            </span>
          </div>
        )}
      </div>

      {/* ── Alert banner (solo alertas críticas) ── */}
      {claudeResult?.alerta_critica?.activa && (
        <div style={{ padding: "8px 20px", flexShrink: 0 }}>
          <AlertBanner alert={claudeResult.alerta_critica} />
        </div>
      )}

      {/* ── Main 2-column layout ── */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: 16, padding: 16,
        minHeight: 0, overflow: "hidden",
      }}>

        {/* ── Col 1: Grabación + Transcripción ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>

          {/* Grabación */}
          <PanelCard>
            <PanelHeader icon={Mic} label="Grabación de voz" />
            <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <VoiceRecorder onTranscript={handleTranscript} disabled={isProcessing} />

              <button
                onClick={handleProcess}
                disabled={isProcessing || !transcript.trim()}
                style={{
                  width: "100%", padding: "11px 16px",
                  background: isProcessing || !transcript.trim()
                    ? "rgba(16,185,129,0.03)"
                    : "rgba(16,185,129,0.1)",
                  border: `1px solid ${isProcessing || !transcript.trim() ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.4)"}`,
                  borderRadius: 6,
                  cursor: isProcessing || !transcript.trim() ? "not-allowed" : "pointer",
                  color: isProcessing || !transcript.trim() ? "rgba(16,185,129,0.35)" : C.green,
                  fontSize: 11, fontWeight: 600, fontFamily: mono,
                  letterSpacing: "0.1em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all 0.2s",
                }}
              >
                {isProcessing ? (
                  <><Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} /> Generando informe...</>
                ) : (
                  <><CheckCircle size={12} /> Generar informe</>
                )}
              </button>
            </div>
          </PanelCard>

          {/* Transcripción */}
          <PanelCard style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <TranscriptPanel transcript={transcript} isRecording={isRecording} />
            </div>
          </PanelCard>
        </div>

        {/* ── Col 2: Editor de Informe ── */}
        <PanelCard style={{ minHeight: 0 }}>
          <PanelHeader
            icon={PenLine}
            label="Informe"
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                {/* Badge few-shot */}
                {fb.fewshotCount > 0 && (
                  <span
                    title={`${fb.fewshotCount} informe${fb.fewshotCount > 1 ? "s" : ""} similar${fb.fewshotCount > 1 ? "es" : ""} inyectados como referencia a Claude (similitud ${Math.round(fb.fewshotSimilarity * 100)}%)`}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 9, padding: "2px 7px", borderRadius: 4,
                      background: "rgba(0,212,255,0.08)",
                      border: "1px solid rgba(0,212,255,0.22)",
                      color: C.cyan, letterSpacing: "0.08em", cursor: "default",
                    }}
                  >
                    <BrainCircuit size={9} />
                    {fb.fewshotCount} ref.
                  </span>
                )}

                {/* Toggle diff */}
                {currentReport?.status === "BORRADOR" && fb.originalText && (
                  <button
                    onClick={() => setDiffOpen(o => !o)}
                    title="Ver diferencias respecto al texto generado por IA"
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 9, padding: "2px 7px", borderRadius: 4,
                      background: diffOpen ? "rgba(16,185,129,0.10)" : "rgba(148,163,184,0.06)",
                      border: `1px solid ${diffOpen ? "rgba(16,185,129,0.30)" : "rgba(148,163,184,0.18)"}`,
                      color: diffOpen ? C.green : C.muted,
                      cursor: "pointer", fontFamily: mono, letterSpacing: "0.08em",
                      transition: "all 0.15s",
                    }}
                  >
                    <GitCompare size={9} />
                    Diff
                  </button>
                )}

                {/* Acciones firma / PDF / RIS */}
                {currentReport?.status === "BORRADOR" ? (
                  <button
                    onClick={handleSign}
                    disabled={fb.isSaving}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 16px",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.35)",
                      borderRadius: 5, cursor: fb.isSaving ? "not-allowed" : "pointer",
                      color: C.green, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.12em",
                      textTransform: "uppercase" as const, transition: "all 0.2s",
                    }}
                  >
                    {fb.isSaving
                      ? <><Loader2 size={11} style={{ animation: "spin 0.7s linear infinite" }} /> Guardando...</>
                      : <><PenLine size={11} /> Aprobar y firmar</>
                    }
                  </button>
                ) : currentReport?.status === "FIRMADO" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={generatePdf}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", background: C.elevated,
                        border: `1px solid ${C.borderSub}`, borderRadius: 5, cursor: "pointer",
                        color: C.sub, fontSize: 10, fontWeight: 600,
                        fontFamily: mono, letterSpacing: "0.1em",
                        textTransform: "uppercase" as const, transition: "all 0.2s",
                      }}
                    >
                      <FileDown size={11} /> PDF
                    </button>
                    <button
                      onClick={sendToRis}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px",
                        background: "rgba(0,212,255,0.08)",
                        border: "1px solid rgba(0,212,255,0.3)",
                        borderRadius: 5, cursor: "pointer",
                        color: C.cyan, fontSize: 10, fontWeight: 600,
                        fontFamily: mono, letterSpacing: "0.1em",
                        textTransform: "uppercase" as const, transition: "all 0.2s",
                      }}
                    >
                      <Send size={11} /> Enviar RIS
                    </button>
                  </div>
                ) : null}
              </div>
            }
          />

          {/* ── Panel advertencias ── */}
          {(() => {
            const warns = claudeResult?.metadata?.advertencias ?? [];
            if (!warns.length) return null;
            return (
              <div style={{
                margin: "0 12px", marginTop: 10, borderRadius: 6, flexShrink: 0, overflow: "hidden",
                border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.05)",
              }}>
                <button
                  onClick={() => setWarningsOpen(o => !o)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 7,
                    padding: "7px 12px", background: "transparent", border: "none", cursor: "pointer",
                    color: C.amber, fontFamily: mono, fontSize: 10,
                    fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                  }}
                >
                  <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {warns.length} advertencia{warns.length > 1 ? "s" : ""} del procesamiento
                  </span>
                  <ChevronDown size={11} style={{
                    transform: warningsOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }} />
                </button>
                {warningsOpen && (
                  <ul style={{
                    margin: 0, padding: "0 12px 10px 28px", listStyle: "disc",
                    color: "rgba(245,158,11,0.85)", fontFamily: mono, fontSize: 10.5, lineHeight: 1.6,
                  }}>
                    {warns.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* ── Panel Diff (colapsable) ── */}
          {diffOpen && fb.originalText && currentReport?.status === "BORRADOR" && (
            <div style={{ margin: "10px 12px 0", flexShrink: 0 }}>
              <DiffViewer
                original={fb.originalText}
                corrected={fb.currentText || currentReport?.texto_final || ""}
                maxHeight={180}
              />
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <ReportEditor
              key={currentReport?.id || "empty"}
              content={currentReport?.texto_final || ""}
              onChange={handleEditorChange}
              readOnly={currentReport?.status === "FIRMADO" || currentReport?.status === "ENVIADO"}
            />
          </div>
        </PanelCard>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function DictationPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "#0d111a" }}>
        <span style={{ color: "#7a90aa", fontSize: 13, fontFamily: "monospace" }}>Cargando...</span>
      </div>
    }>
      <DictationContent />
    </Suspense>
  );
}
