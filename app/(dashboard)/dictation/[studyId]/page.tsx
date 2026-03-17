"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useRef, Suspense, useState, useEffect } from "react";
import { VoiceRecorder } from "@/components/dictation/VoiceRecorder";
import { TranscriptPanel } from "@/components/dictation/TranscriptPanel";
import { ReportEditor } from "@/components/dictation/ReportEditor";
import { AlertBanner } from "@/components/dictation/AlertBanner";
import { DiffViewer } from "@/components/dictation/DiffViewer";
import { useReportStore } from "@/store/reportStore";
import { useFeedbackCapture } from "@/hooks/useFeedbackCapture";
import { Loader2, PenLine, Send, FileDown, Mic, ChevronRight, CheckCircle, AlertTriangle, ChevronDown, BrainCircuit, GitCompare, Menu, Save } from "lucide-react";
import Link from "next/link";
import { useMobileCtx } from "../../layout";

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
  const { isMobile, toggleMenu } = useMobileCtx();
  const {
    transcript, isProcessing, isRecording,
    currentReport, claudeResult,
    setTranscript, processTranscript,
    updateReportText, saveReport, createManualReport,
    signReport, sendToRis, generatePdf,
    reset, loadReport,
  } = useReportStore();

  const studyId = params.studyId !== "new" ? params.studyId : undefined;

  // Reset store when entering a new dictation; load existing report if studyId is set
  useEffect(() => {
    if (params.studyId === "new") {
      reset();
    } else if (params.studyId) {
      loadReport(params.studyId).catch(() => { /* report may not exist yet */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.studyId]);
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
  const [editorHasText, setEditorHasText] = useState(false);
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
    setEditorHasText(!!text.trim());
    fb.onTextChange(text);
    updateReportText(text);
  }, [fb, updateReportText]);

  const handleSave = useCallback(async () => {
    const text = editorTextRef.current;
    if (!text.trim()) return;
    if (currentReport) {
      await saveReport(text);
    } else {
      await createManualReport(text, studyId, accessionNumber);
    }
  }, [currentReport, saveReport, createManualReport, studyId, accessionNumber]);

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
        padding: isMobile ? "0 10px" : "0 20px",
        background: C.surface,
        borderBottom: `1px solid ${C.borderSub}`,
        gap: 8,
      }}>
        {/* Hamburger (mobile) */}
        {isMobile && (
          <button
            onClick={toggleMenu}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6, width: 34, height: 34,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0, color: "rgba(148,163,184,0.8)",
            }}
          >
            <Menu size={16} />
          </button>
        )}

        {!isMobile && (
          <>
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
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Mic size={13} style={{ color: C.cyan, flexShrink: 0 }} />
          <span style={{
            fontSize: isMobile ? 12 : 13, fontWeight: 600, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {isMobile ? "Dictado" : "Dictado de Informe"}
          </span>
        </div>

        {/* Study info pills (hidden on mobile) */}
        {!isMobile && (
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
        )}

        {/* Status badge */}
        {currentReport && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
        flex: 1, display: isMobile ? "flex" : "grid",
        flexDirection: isMobile ? "column" : undefined,
        gridTemplateColumns: isMobile ? undefined : "320px 1fr",
        gap: isMobile ? 12 : 16,
        padding: isMobile ? 10 : 16,
        minHeight: 0, overflow: isMobile ? "auto" : "hidden",
      }}>

        {/* ── Col 1: Grabación + Transcripción ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>

          {/* Grabación */}
          <PanelCard>
            <PanelHeader icon={Mic} label="Grabación de voz" />
            <div style={{ padding: isMobile ? "14px 12px" : "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 10 : 14 }}>
              <VoiceRecorder onTranscript={handleTranscript} disabled={isProcessing} />

              {(() => {
                const hasContent = !!(transcript.trim() || editorHasText);
                const disabled = isProcessing || !hasContent;
                return (
                  <button
                    onClick={handleProcess}
                    disabled={disabled}
                    style={{
                      width: "100%", padding: isMobile ? "13px 16px" : "11px 16px",
                      background: disabled ? "rgba(16,185,129,0.03)" : "rgba(16,185,129,0.1)",
                      border: `1px solid ${disabled ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.4)"}`,
                      borderRadius: 6,
                      cursor: disabled ? "not-allowed" : "pointer",
                      color: disabled ? "rgba(16,185,129,0.35)" : C.green,
                      fontSize: isMobile ? 12 : 11, fontWeight: 600, fontFamily: mono,
                      letterSpacing: "0.1em",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "all 0.2s",
                    }}
                  >
                    {isProcessing ? (
                      <><Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} /> Generando informe...</>
                    ) : (
                      <><CheckCircle size={12} /> Generar informe (IA)</>
                    )}
                  </button>
                );
              })()}

              {/* Botón guardar borrador — sin procesar con IA */}
              {!currentReport && (
                <button
                  onClick={handleSave}
                  disabled={isProcessing || !editorHasText}
                  style={{
                    width: "100%", padding: isMobile ? "13px 16px" : "11px 16px",
                    background: !editorHasText || isProcessing
                      ? "rgba(0,212,255,0.03)"
                      : "rgba(0,212,255,0.1)",
                    border: `1px solid ${!editorHasText || isProcessing ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.4)"}`,
                    borderRadius: 6,
                    cursor: !editorHasText || isProcessing ? "not-allowed" : "pointer",
                    color: !editorHasText || isProcessing ? "rgba(0,212,255,0.35)" : C.cyan,
                    fontSize: isMobile ? 12 : 11, fontWeight: 600, fontFamily: mono,
                    letterSpacing: "0.1em",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all 0.2s",
                  }}
                >
                  <Save size={12} /> Guardar borrador
                </button>
              )}
            </div>
          </PanelCard>

          {/* Transcripción */}
          <PanelCard style={{ flex: isMobile ? undefined : 1, minHeight: isMobile ? 120 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", height: isMobile ? "auto" : "100%" }}>
              <TranscriptPanel transcript={transcript} isRecording={isRecording} />
            </div>
          </PanelCard>
        </div>

        {/* ── Col 2: Editor de Informe ── */}
        <PanelCard style={{ minHeight: isMobile ? 200 : 0 }}>
          <PanelHeader
            icon={PenLine}
            label="Informe"
            right={
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 6, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>

                {/* Badge few-shot */}
                {fb.fewshotCount > 0 && !isMobile && (
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

                {/* Botón Guardar — siempre visible cuando no hay reporte o es borrador */}
                {(!currentReport || currentReport.status === "BORRADOR") && (
                  <button
                    onClick={handleSave}
                    disabled={isProcessing || !editorHasText}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px",
                      background: !editorHasText ? "rgba(0,212,255,0.03)" : "rgba(0,212,255,0.08)",
                      border: `1px solid ${!editorHasText ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.3)"}`,
                      borderRadius: 5,
                      cursor: isProcessing || !editorHasText ? "not-allowed" : "pointer",
                      color: !editorHasText ? "rgba(0,212,255,0.35)" : C.cyan,
                      fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em",
                      textTransform: "uppercase" as const, transition: "all 0.2s",
                    }}
                  >
                    <Save size={11} /> Guardar
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
                      ? <><Loader2 size={11} style={{ animation: "spin 0.7s linear infinite" }} /> {isMobile ? "..." : "Guardando..."}</>
                      : <><PenLine size={11} /> {isMobile ? "Aprobar" : "Aprobar y firmar"}</>
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
