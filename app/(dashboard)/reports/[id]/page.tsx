"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertBanner } from "@/components/dictation/AlertBanner";
import { StructuredView } from "@/components/dictation/StructuredView";
import { ReportEditor } from "@/components/dictation/ReportEditor";
import { useReportStore } from "@/store/reportStore";
import { useAuthStore } from "@/store/authStore";
import { reportsApi, adminApi, worklistApi } from "@/lib/api";
import type { User, WorklistItem } from "@/types/report.types";
import { toast } from "sonner";
import {
  PenLine, Send, FileDown, Loader2, ChevronRight, Menu,
  FileText, Trash2, Save, Mic, RotateCcw, UserCheck, CheckCircle, AlertTriangle, User as UserIcon, Link2,
} from "lucide-react";
import { useMobileCtx } from "../../layout";

const mono = "var(--font-ibm-plex-mono), monospace";

const C = {
  bg:        "#0d111a",
  surface:   "#161f2e",
  elevated:  "#1e2a3d",
  border:    "rgba(148,163,184,0.18)",
  cyan:      "#00d4ff",
  green:     "#10b981",
  red:       "#ff4757",
  amber:     "#f59e0b",
  text:      "#f1f5f9",
  sub:       "#b0bfd4",
  muted:     "#7a90aa",
};

const STATUS_COLOR: Record<string, string> = {
  BORRADOR:    C.muted,
  EN_REVISION: C.amber,
  FIRMADO:     C.green,
  ENVIADO:     C.cyan,
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isMobile, toggleMenu } = useMobileCtx();
  const { currentReport, claudeResult, loadReport, signReport, sendToRis, generatePdf } = useReportStore();
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = authUser?.role === "ADMIN" || authUser?.role === "JEFE_SERVICIO";

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signing, setSigning] = useState(false);
  const [invalidating, setInvalidating] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAlertConfirm, setShowAlertConfirm] = useState(false);
  const [showLinkPatient, setShowLinkPatient] = useState(false);
  const [showInvalidateConfirm, setShowInvalidateConfirm] = useState(false);
  const [invalidatePassword, setInvalidatePassword] = useState("");
  const [invalidateReason, setInvalidateReason] = useState("");
  const [invalidateError, setInvalidateError] = useState("");
  const [radiologists, setRadiologists] = useState<User[]>([]);
  const [worklistItems, setWorklistItems] = useState<WorklistItem[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [linking, setLinking] = useState(false);
  const editorTextRef = useRef<string>(currentReport?.texto_final ?? "");

  // Load radiologists list for assign dropdown (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    adminApi.users().then(r => {
      setRadiologists(r.data.filter(u => u.role === "RADIOLOGO" || u.role === "JEFE_SERVICIO"));
    }).catch(() => {});
  }, [isAdmin]);

  // Load worklist entries for link-patient modal (all statuses)
  useEffect(() => {
    if (!showLinkPatient) return;
    // Fetch PENDIENTE + INFORMADO separately (backend default is PENDIENTE)
    Promise.all([
      worklistApi.list("PENDIENTE"),
      worklistApi.list("INFORMADO"),
      worklistApi.list("ENVIADO"),
    ]).then(([p, i, e]) => {
      const seen = new Set<string>();
      const all = [...p.data, ...i.data, ...e.data].filter(w => {
        if (seen.has(w.id)) return false;
        seen.add(w.id);
        return true;
      });
      setWorklistItems(all);
    }).catch(() => {});
  }, [showLinkPatient]);

  useEffect(() => {
    if (params.id) loadReport(params.id);
  }, [params.id]);

  const handleEditorChange = useCallback((text: string) => {
    editorTextRef.current = text;
    useReportStore.getState().updateReportText(text);
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentReport) return;
    setSaving(true);
    try {
      await reportsApi.update(currentReport.id, { texto_final: editorTextRef.current });
      toast.success("Cambios guardados");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [currentReport]);

  const handleDelete = useCallback(async () => {
    if (!currentReport) return;
    if (!confirm("¿Eliminar este borrador? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    try {
      await reportsApi.delete(currentReport.id);
      toast.success("Borrador eliminado");
      router.push("/reports");
    } catch {
      toast.error("Error al eliminar");
      setDeleting(false);
    }
  }, [currentReport, router]);

  const handleSign = useCallback(async () => {
    if (currentReport?.has_alert) {
      setShowAlertConfirm(true);
      return;
    }
    setSigning(true);
    try {
      await signReport();
      toast.success("Informe aprobado");
    } finally {
      setSigning(false);
    }
  }, [signReport, currentReport]);

  const confirmSign = useCallback(async () => {
    setShowAlertConfirm(false);
    setSigning(true);
    try {
      await signReport();
      toast.success("Informe aprobado");
    } finally {
      setSigning(false);
    }
  }, [signReport]);

  const handleInvalidate = useCallback(() => {
    setInvalidatePassword("");
    setInvalidateReason("");
    setInvalidateError("");
    setShowInvalidateConfirm(true);
  }, []);

  const confirmInvalidate = useCallback(async () => {
    if (!currentReport) return;
    if (!invalidatePassword.trim()) {
      setInvalidateError("Ingresa tu contraseña para confirmar");
      return;
    }
    setInvalidating(true);
    setInvalidateError("");
    try {
      await reportsApi.invalidate(currentReport.id, invalidatePassword, invalidateReason || undefined);
      setShowInvalidateConfirm(false);
      await loadReport(currentReport.id);
      toast.success("Informe revertido a borrador");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (msg === "Contraseña incorrecta") {
        setInvalidateError("Contraseña incorrecta. Inténtalo nuevamente.");
      } else {
        setInvalidateError("Error al invalidar. Intenta de nuevo.");
      }
    } finally {
      setInvalidating(false);
    }
  }, [currentReport, invalidatePassword, invalidateReason, loadReport]);

  const handleLinkWorklist = useCallback(async (worklistId: string) => {
    if (!currentReport) return;
    setLinking(true);
    try {
      const { data } = await reportsApi.linkWorklist(currentReport.id, worklistId);
      await loadReport(currentReport.id);
      setShowLinkPatient(false);
      toast.success(`Paciente vinculado: ${data.patient_name ?? ""}`);
    } catch {
      toast.error("Error al vincular el paciente");
    } finally {
      setLinking(false);
    }
  }, [currentReport, loadReport]);

  const handleAssign = useCallback(async (userId: string) => {
    if (!currentReport) return;
    setAssigning(true);
    try {
      await reportsApi.assign(currentReport.id, userId);
      await loadReport(currentReport.id);
      setShowAssign(false);
      toast.success("Informe asignado");
    } catch {
      toast.error("Error al asignar el informe");
    } finally {
      setAssigning(false);
    }
  }, [currentReport, loadReport]);

  if (!currentReport) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} style={{ color: C.muted, animation: "loginSpin 0.8s linear infinite" }} />
      </div>
    );
  }

  const isSigned = currentReport.status === "FIRMADO" || currentReport.status === "ENVIADO";
  const statusColor = STATUS_COLOR[currentReport.status] ?? C.muted;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, fontFamily: mono }}>

      {/* ── Header ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: isMobile ? "0 10px" : "0 20px", gap: 8,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
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

        {/* Breadcrumb */}
        {!isMobile && (
          <>
            <button
              onClick={() => router.push("/reports")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4,
                transition: "color 0.15s", padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.sub)}
              onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
            >
              Informes
            </button>
            <ChevronRight size={12} style={{ color: C.muted }} />
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <FileText size={13} style={{ color: C.cyan, flexShrink: 0 }} />
          <span style={{
            fontSize: isMobile ? 12 : 13, fontWeight: 600, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentReport.modalidad || "Estudio"} — {currentReport.region_anatomica || "Sin región"}
          </span>
        </div>

        {/* Meta (hidden on mobile) */}
        {!isMobile && (
          <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 6 }}>
            {currentReport.accession_number && (
              <span style={{
                fontSize: 9.5, padding: "2px 8px",
                background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)",
                borderRadius: 4, color: C.cyan, letterSpacing: "0.08em",
              }}>
                {currentReport.accession_number}
              </span>
            )}
            {currentReport.patient_name && (
              <span style={{
                fontSize: 9.5, padding: "2px 8px",
                background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 4, color: C.sub, letterSpacing: "0.06em",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <UserIcon size={9} />
                {currentReport.patient_name}
                {currentReport.patient_rut && (
                  <span style={{ color: C.muted, marginLeft: 2 }}>· {currentReport.patient_rut}</span>
                )}
              </span>
            )}
            {currentReport.assigned_to_name && (
              <span style={{
                fontSize: 9.5, padding: "2px 8px",
                background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 4, color: C.amber, letterSpacing: "0.06em",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <UserCheck size={9} />
                {currentReport.assigned_to_name}
              </span>
            )}
            <span style={{ fontSize: 10, color: C.muted }}>{formatDate(currentReport.created_at)}</span>
          </div>
        )}

        {/* Status */}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <span style={{
            fontSize: 9.5, padding: "3px 10px",
            background: `${statusColor}15`, border: `1px solid ${statusColor}35`,
            borderRadius: 4, color: statusColor,
            fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            {currentReport.status}
          </span>
        </div>
      </div>

      {/* ── Alert ── */}
      {claudeResult?.alerta_critica?.activa && (
        <div style={{ padding: "8px 20px", flexShrink: 0 }}>
          <AlertBanner alert={claudeResult.alerta_critica} />
        </div>
      )}

      {/* ── Content ── */}
      <div style={{
        flex: 1, display: isMobile ? "flex" : "grid",
        flexDirection: isMobile ? "column" : undefined,
        gridTemplateColumns: isMobile ? undefined : "1fr 280px",
        gap: isMobile ? 12 : 16,
        padding: isMobile ? 10 : 16,
        minHeight: 0, overflow: isMobile ? "auto" : "hidden",
      }}>

        {/* Left: editor + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>

          {/* Editor panel */}
          <div style={{
            flex: 1, minHeight: 0,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Panel header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: isMobile ? "8px 10px" : "10px 14px",
              background: C.elevated, borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
              flexWrap: isMobile ? "wrap" as const : "nowrap" as const,
            }}>
              <PenLine size={13} style={{ color: C.cyan, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: "0.16em", flexShrink: 0 }}>
                {isMobile ? "Informe" : "Texto del Informe"}
              </span>

              {/* Action buttons (right side) */}
              <div style={{ marginLeft: "auto", display: "flex", gap: isMobile ? 4 : 6, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>

                {/* Dictar / Re-dictate: BORRADOR */}
                {currentReport.status === "BORRADOR" && (
                  <button
                    onClick={() => {
                      const ac = currentReport.accession_number || "";
                      if (currentReport.study_id) {
                        router.push(`/dictation/${currentReport.study_id}?accession=${ac}`);
                      } else {
                        router.push(`/dictation/new?accession=${ac}`);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: "rgba(0,212,255,0.08)",
                      border: "1px solid rgba(0,212,255,0.3)",
                      borderRadius: 5, cursor: "pointer",
                      color: C.cyan, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em",
                      textTransform: "uppercase", transition: "all 0.15s",
                    }}
                    title="Ir a la página de dictado por voz"
                  >
                    <Mic size={11} /> Dictar
                  </button>
                )}

                {/* Save: BORRADOR */}
                {currentReport.status === "BORRADOR" && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      display: "flex", alignItems: "center", gap: isMobile ? 3 : 5,
                      padding: isMobile ? "5px 8px" : "5px 11px",
                      background: "rgba(148,163,184,0.06)",
                      border: `1px solid ${C.border}`,
                      borderRadius: 5, cursor: saving ? "not-allowed" : "pointer",
                      color: C.sub, fontSize: isMobile ? 9 : 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em",
                      textTransform: "uppercase", transition: "all 0.15s",
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving
                      ? <><Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} /></>
                      : <><Save size={10} /> {!isMobile && "Guardar"}</>
                    }
                  </button>
                )}

                {/* Sign: BORRADOR */}
                {currentReport.status === "BORRADOR" && (
                  <button
                    onClick={handleSign}
                    disabled={signing}
                    style={{
                      display: "flex", alignItems: "center", gap: isMobile ? 3 : 5,
                      padding: isMobile ? "5px 8px" : "5px 12px",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.35)",
                      borderRadius: 5, cursor: signing ? "not-allowed" : "pointer",
                      color: C.green, fontSize: isMobile ? 9 : 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em",
                      textTransform: "uppercase", transition: "all 0.15s",
                      opacity: signing ? 0.6 : 1,
                    }}
                  >
                    {signing
                      ? <><Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} /></>
                      : <><PenLine size={10} /> Aprobar</>
                    }
                  </button>
                )}

                {/* PDF + Send: FIRMADO */}
                {currentReport.status === "FIRMADO" && (
                  <>
                    <button onClick={generatePdf} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px", background: C.elevated,
                      border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer",
                      color: C.sub, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      <FileDown size={10} /> PDF
                    </button>
                    <button onClick={sendToRis} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: "rgba(0,212,255,0.08)",
                      border: "1px solid rgba(0,212,255,0.3)",
                      borderRadius: 5, cursor: "pointer",
                      color: C.cyan, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      <Send size={10} /> RIS
                    </button>
                  </>
                )}

                {/* PDF: ENVIADO */}
                {currentReport.status === "ENVIADO" && (
                  <button onClick={generatePdf} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 11px", background: C.elevated,
                    border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer",
                    color: C.sub, fontSize: 10, fontWeight: 600,
                    fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                  }}>
                    <FileDown size={10} /> PDF
                  </button>
                )}

                {/* Vincular Paciente: siempre visible si no hay paciente */}
                {!currentReport.patient_name && (
                  <button
                    onClick={() => setShowLinkPatient(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: "rgba(0,212,255,0.06)",
                      border: "1px solid rgba(0,212,255,0.25)",
                      borderRadius: 5, cursor: "pointer",
                      color: C.cyan, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}
                    title="Vincular este informe a un paciente del worklist"
                  >
                    <Link2 size={10} /> {isMobile ? "Vincular" : "Vincular Paciente"}
                  </button>
                )}

                {/* Asignar: admin/jefe, only while BORRADOR */}
                {isAdmin && currentReport.status === "BORRADOR" && (
                  <button
                    onClick={() => setShowAssign(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: "rgba(245,158,11,0.06)",
                      border: "1px solid rgba(245,158,11,0.25)",
                      borderRadius: 5, cursor: "pointer",
                      color: C.amber, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}
                    title="Asignar informe a un radiólogo"
                  >
                    <UserCheck size={10} /> Asignar
                  </button>
                )}

                {/* Invalidar: admin/jefe on FIRMADO or ENVIADO */}
                {isAdmin && (currentReport.status === "FIRMADO" || currentReport.status === "ENVIADO") && (
                  <button
                    onClick={handleInvalidate}
                    disabled={invalidating}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 11px",
                      background: "rgba(255,71,87,0.06)",
                      border: "1px solid rgba(255,71,87,0.22)",
                      borderRadius: 5, cursor: invalidating ? "not-allowed" : "pointer",
                      color: C.red, fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase",
                      opacity: invalidating ? 0.5 : 1, transition: "all 0.15s",
                    }}
                    title="Revertir a borrador"
                  >
                    {invalidating
                      ? <Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} />
                      : <RotateCcw size={10} />
                    }
                    Invalidar
                  </button>
                )}

                {/* Delete: BORRADOR only */}
                {currentReport.status === "BORRADOR" && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 10px",
                      background: "rgba(255,71,87,0.06)",
                      border: "1px solid rgba(255,71,87,0.2)",
                      borderRadius: 5, cursor: deleting ? "not-allowed" : "pointer",
                      color: "#ff4757", fontSize: 10, fontWeight: 600,
                      fontFamily: mono, letterSpacing: "0.1em",
                      textTransform: "uppercase", transition: "all 0.15s",
                      opacity: deleting ? 0.5 : 1,
                    }}
                    title="Eliminar borrador"
                  >
                    {deleting
                      ? <Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} />
                      : <Trash2 size={10} />
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <ReportEditor
                key={currentReport.id}
                content={currentReport.texto_final || ""}
                onChange={handleEditorChange}
                readOnly={isSigned}
              />
            </div>
          </div>
        </div>

        {/* Right: metadata + structured analysis */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>

          {/* Signed-by info */}
          {(currentReport.status === "FIRMADO" || currentReport.status === "ENVIADO") && currentReport.signed_by_name && (
            <div style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 7, padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={11} style={{ color: C.green, flexShrink: 0 }} />
                <span style={{ fontSize: 9.5, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: mono }}>
                  Aprobado por
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 500, paddingLeft: 17 }}>
                {currentReport.signed_by_name}
              </div>
              {currentReport.signed_at && (
                <div style={{ fontSize: 10, color: C.muted, paddingLeft: 17 }}>
                  {formatDate(currentReport.signed_at)}
                </div>
              )}
            </div>
          )}

          {/* Assigned-to info */}
          {currentReport.assigned_to_name && (
            <div style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.22)",
              borderRadius: 7, padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <UserCheck size={11} style={{ color: C.amber, flexShrink: 0 }} />
                <span style={{ fontSize: 9.5, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: mono }}>
                  Asignado a
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 500, paddingLeft: 17 }}>
                {currentReport.assigned_to_name}
              </div>
            </div>
          )}

          {claudeResult
            ? <StructuredView data={claudeResult} />
            : (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "32px 20px", textAlign: "center",
              }}>
                <FileText size={28} style={{ color: C.muted, margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                  Sin datos de análisis AI
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* ── Assign Modal ── */}
      {showAssign && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowAssign(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: isMobile ? 16 : 20, width: isMobile ? "calc(100% - 32px)" : 320, maxWidth: 320, fontFamily: mono,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 14 }}>
              Asignar a radiólogo
            </div>
            {radiologists.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, padding: "12px 0" }}>Sin radiólogos disponibles</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {radiologists.map(r => (
                  <button
                    key={r.id}
                    disabled={assigning}
                    onClick={() => handleAssign(r.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px",
                      background: currentReport.assigned_to_id === r.id ? "rgba(245,158,11,0.1)" : C.elevated,
                      border: `1px solid ${currentReport.assigned_to_id === r.id ? "rgba(245,158,11,0.4)" : C.border}`,
                      borderRadius: 6, cursor: assigning ? "not-allowed" : "pointer",
                      color: C.text, fontSize: 11,
                      transition: "all 0.15s",
                      opacity: assigning ? 0.6 : 1,
                    }}
                  >
                    <span>{r.full_name}</span>
                    <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{r.role}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAssign(false)}
              style={{
                marginTop: 14, width: "100%",
                padding: "7px 0",
                background: "none", border: `1px solid ${C.border}`,
                borderRadius: 6, cursor: "pointer",
                color: C.muted, fontSize: 10, fontFamily: mono,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Critical Alert Confirmation Modal ── */}
      {showAlertConfirm && currentReport && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowAlertConfirm(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, border: "1px solid rgba(255,71,87,0.35)",
              borderRadius: 10, padding: isMobile ? 16 : 24, width: isMobile ? "calc(100% - 32px)" : 380, maxWidth: 380, fontFamily: mono,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: "rgba(255,71,87,0.12)",
                border: "1px solid rgba(255,71,87,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={17} style={{ color: C.red }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  Diagnóstico Crítico Detectado
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  Este informe tiene una alerta activa
                </div>
              </div>
            </div>

            {/* Alert description */}
            {currentReport.alert_desc && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(255,71,87,0.06)",
                border: "1px solid rgba(255,71,87,0.18)",
                borderRadius: 6, marginBottom: 18,
                fontSize: 12, color: "#fca5a5",
                lineHeight: 1.55,
              }}>
                {currentReport.alert_desc}
              </div>
            )}

            <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.6, marginBottom: 20 }}>
              ¿Confirma que ha revisado el diagnóstico crítico y desea firmar el informe de todas formas?
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAlertConfirm(false)}
                style={{
                  padding: "7px 16px",
                  background: "none", border: `1px solid ${C.border}`,
                  borderRadius: 6, cursor: "pointer",
                  color: C.muted, fontSize: 11, fontFamily: mono,
                  transition: "all 0.15s",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmSign}
                disabled={signing}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 18px",
                  background: "rgba(255,71,87,0.12)",
                  border: "1px solid rgba(255,71,87,0.4)",
                  borderRadius: 6, cursor: signing ? "not-allowed" : "pointer",
                  color: C.red, fontSize: 11, fontWeight: 600,
                  fontFamily: mono, letterSpacing: "0.08em",
                  opacity: signing ? 0.6 : 1, transition: "all 0.15s",
                }}
              >
                {signing
                  ? <><Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} /> Firmando</>
                  : <><PenLine size={10} /> Firmar de todas formas</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Patient Modal ── */}
      {showLinkPatient && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowLinkPatient(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, border: "1px solid rgba(0,212,255,0.25)",
              borderRadius: 10, padding: isMobile ? 14 : 20, width: isMobile ? "calc(100% - 32px)" : 420, maxWidth: 420, maxHeight: "70vh",
              display: "flex", flexDirection: "column", fontFamily: mono,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Link2 size={13} style={{ color: C.cyan }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Vincular Paciente
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 12 }}>
              Selecciona el estudio del worklist que corresponde a este informe
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {worklistItems.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: C.muted }}>
                  <Loader2 size={16} style={{ animation: "loginSpin 0.8s linear infinite", margin: "0 auto 8px", display: "block" }} />
                  Cargando estudios...
                </div>
              ) : worklistItems.map(wl => (
                <button
                  key={wl.id}
                  disabled={linking}
                  onClick={() => handleLinkWorklist(wl.id)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "10px 12px", textAlign: "left",
                    background: C.elevated, border: `1px solid ${C.border}`,
                    borderRadius: 7, cursor: linking ? "not-allowed" : "pointer",
                    transition: "all 0.15s", opacity: linking ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,212,255,0.35)"; e.currentTarget.style.background = "rgba(0,212,255,0.05)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.elevated; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <UserIcon size={11} style={{ color: C.cyan, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                      {wl.patient_name ?? "Sin nombre"}
                    </span>
                    {wl.patient_rut && (
                      <span style={{ fontSize: 10, color: C.muted }}>· {wl.patient_rut}</span>
                    )}
                    <span style={{
                      marginLeft: "auto", fontSize: 9, padding: "2px 7px",
                      background: wl.status === "PENDIENTE" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.08)",
                      border: `1px solid ${wl.status === "PENDIENTE" ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.25)"}`,
                      borderRadius: 3, color: wl.status === "PENDIENTE" ? C.amber : C.green,
                      letterSpacing: "0.08em",
                    }}>
                      {wl.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, paddingLeft: 19, fontSize: 10, color: C.muted }}>
                    <span>{wl.accession_number}</span>
                    {wl.modalidad && <span>{wl.modalidad}</span>}
                    {wl.region && <span>{wl.region}</span>}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowLinkPatient(false)}
              style={{
                marginTop: 14, width: "100%", padding: "7px 0",
                background: "none", border: `1px solid ${C.border}`,
                borderRadius: 6, cursor: "pointer",
                color: C.muted, fontSize: 10, fontFamily: mono,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Invalidate Credential Confirmation Modal ── */}
      {showInvalidateConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => !invalidating && setShowInvalidateConfirm(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, border: "1px solid rgba(255,71,87,0.35)",
              borderRadius: 10, padding: isMobile ? 16 : 24, width: isMobile ? "calc(100% - 32px)" : 400, maxWidth: 400, fontFamily: mono,
              boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <RotateCcw size={17} style={{ color: C.red }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Invalidar Informe</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  Esta acción quedará registrada con trazabilidad completa
                </div>
              </div>
            </div>

            {/* Warning */}
            <div style={{
              padding: "10px 14px", marginBottom: 16,
              background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.18)",
              borderRadius: 6, fontSize: 11.5, color: "#fca5a5", lineHeight: 1.55,
            }}>
              El informe volverá a estado <strong>BORRADOR</strong>. Se borrará la firma digital
              {currentReport?.status === "ENVIADO" && " y el registro de envío al RIS"}.
              Esta acción quedará registrada con tu nombre, la fecha y la IP de origen.
            </div>

            {/* Reason (optional) */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                Motivo (opcional)
              </label>
              <textarea
                value={invalidateReason}
                onChange={e => setInvalidateReason(e.target.value)}
                placeholder="Ej: Error en descripción, corrección solicitada por médico tratante..."
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "8px 10px",
                  background: C.elevated, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text,
                  fontSize: 11, fontFamily: mono,
                  resize: "vertical", outline: "none",
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                Confirma tu contraseña
              </label>
              <input
                type="password"
                value={invalidatePassword}
                onChange={e => { setInvalidatePassword(e.target.value); setInvalidateError(""); }}
                onKeyDown={e => e.key === "Enter" && confirmInvalidate()}
                placeholder="••••••••"
                autoFocus
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 12px",
                  background: C.elevated,
                  border: `1px solid ${invalidateError ? "rgba(255,71,87,0.5)" : C.border}`,
                  borderRadius: 6, color: C.text,
                  fontSize: 13, fontFamily: mono, outline: "none",
                  transition: "border-color 0.15s",
                }}
              />
              {invalidateError && (
                <div style={{ marginTop: 5, fontSize: 10.5, color: C.red }}>{invalidateError}</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowInvalidateConfirm(false)}
                disabled={invalidating}
                style={{
                  padding: "8px 18px", background: "none",
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  cursor: invalidating ? "not-allowed" : "pointer",
                  color: C.muted, fontSize: 11, fontFamily: mono,
                  opacity: invalidating ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmInvalidate}
                disabled={invalidating || !invalidatePassword.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 20px",
                  background: "rgba(255,71,87,0.12)",
                  border: "1px solid rgba(255,71,87,0.4)",
                  borderRadius: 6,
                  cursor: (invalidating || !invalidatePassword.trim()) ? "not-allowed" : "pointer",
                  color: C.red, fontSize: 11, fontWeight: 600,
                  fontFamily: mono, letterSpacing: "0.08em",
                  opacity: (invalidating || !invalidatePassword.trim()) ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
              >
                {invalidating
                  ? <><Loader2 size={10} style={{ animation: "loginSpin 0.7s linear infinite" }} /> Procesando</>
                  : <><RotateCcw size={10} /> Confirmar invalidación</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes loginSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
