"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { reportsApi, worklistApi } from "@/lib/api";
import type { Report, WorklistItem } from "@/types/report.types";
import { formatDate } from "@/lib/utils";
import { FileText, AlertTriangle, ChevronLeft, ChevronRight, FilePlus, Plus, X, RefreshCw, Link2 } from "lucide-react";
import { reportsCreateApi } from "@/lib/api";
import { toast } from "sonner";
import { useMobileCtx } from "../layout";

const STATUSES = ["", "BORRADOR", "EN_REVISION", "FIRMADO", "ENVIADO"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  "":          { label: "Todos",       color: "#8a9ab8",  bg: "rgba(138,154,184,0.08)", border: "rgba(138,154,184,0.2)",  dot: "#8a9ab8"  },
  BORRADOR:    { label: "Borrador",    color: "#8a9ab8",  bg: "rgba(138,154,184,0.08)", border: "rgba(138,154,184,0.2)",  dot: "#8a9ab8"  },
  EN_REVISION: { label: "En revisión", color: "#ffa502",  bg: "rgba(255,165,2,0.08)",   border: "rgba(255,165,2,0.25)",   dot: "#ffa502"  },
  FIRMADO:     { label: "Firmado",     color: "#2ed573",  bg: "rgba(46,213,115,0.08)",  border: "rgba(46,213,115,0.25)",  dot: "#2ed573"  },
  ENVIADO:     { label: "Enviado",     color: "#00d4ff",  bg: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.25)",   dot: "#00d4ff"  },
};

export default function ReportsPage() {
  const { isMobile, toggleMenu } = useMobileCtx();
  const [data, setData] = useState<{ items: Report[]; total: number; page: number; per_page: number } | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ accession_number: "", texto: "" });
  const [saving, setSaving] = useState(false);

  // Link-patient modal state
  const [linkTarget, setLinkTarget] = useState<Report | null>(null);
  const [wlItems, setWlItems] = useState<WorklistItem[]>([]);
  const [wlLoading, setWlLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  const handleCreate = async () => {
    if (!form.texto.trim()) { toast.error("El contenido del informe es obligatorio"); return; }
    setSaving(true);
    try {
      await reportsCreateApi.createManual({
        accession_number: form.accession_number || undefined,
        raw_transcript: form.texto,
      });
      toast.success("Informe creado como borrador");
      setShowModal(false);
      setForm({ accession_number: "", texto: "" });
      setPage(1);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Error al crear el informe");
    } finally {
      setSaving(false);
    }
  };

  const openLinkModal = (e: React.MouseEvent, report: Report) => {
    e.preventDefault();
    e.stopPropagation();
    setLinkTarget(report);
    setWlLoading(true);
    worklistApi.list()
      .then((r) => setWlItems(r.data.filter((w: WorklistItem) => !w.report_id)))
      .catch(() => toast.error("Error cargando worklist"))
      .finally(() => setWlLoading(false));
  };

  const handleLinkWorklist = async (wlId: string) => {
    if (!linkTarget) return;
    setLinking(true);
    try {
      await reportsApi.linkWorklist(linkTarget.id, wlId);
      toast.success("Paciente vinculado correctamente");
      setLinkTarget(null);
      // Refresh the list
      setLoading(true);
      reportsApi.list(page, 20, status || undefined)
        .then((r) => setData(r.data))
        .finally(() => setLoading(false));
    } catch {
      toast.error("Error al vincular paciente");
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    reportsApi.list(page, 20, status || undefined)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [page, status]);

  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Informes" subtitle={data ? `${data.total} informes en total` : ""} isMobile={isMobile} onMenuToggle={toggleMenu} />

      <div style={{ flex: 1, padding: isMobile ? "12px" : "24px", overflowY: "auto" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "16px", gap: "8px" }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", background: "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.35)", borderRadius: "6px",
              color: "#00d4ff", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.1)"; }}
          >
            <Plus style={{ width: "13px", height: "13px" }} />
            Nuevo Informe
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const isActive = status === s;
            return (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px",
                  background: isActive ? cfg.bg : "transparent",
                  border: `1px solid ${isActive ? cfg.border : "#1e2535"}`,
                  borderRadius: "6px",
                  color: isActive ? cfg.color : "#4a5878",
                  fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 500,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3550"; (e.currentTarget as HTMLButtonElement).style.color = "#8a9ab8"; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2535"; (e.currentTarget as HTMLButtonElement).style.color = "#4a5878"; } }}
              >
                {s && (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
                )}
                {cfg.label}
                {isActive && data && (
                  <span style={{ fontSize: "10px", color: cfg.color, opacity: 0.7, fontWeight: 400 }}>
                    {s === "" ? data.total : data.items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                background: "#131720", border: "1px solid #1e2535", borderRadius: "8px",
                padding: "14px 16px", display: "flex", gap: "16px", alignItems: "center",
              }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "#1a2030", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ height: "11px", background: "#1a2030", borderRadius: "3px", width: "45%", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: "9px", background: "#1a2030", borderRadius: "3px", width: "25%", animation: "pulse 1.5s ease-in-out infinite 0.2s" }} />
                </div>
                <div style={{ width: "64px", height: "20px", background: "#1a2030", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
              </div>
            ))
          ) : data?.items.length === 0 ? (
            <div style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "8px",
              padding: "56px 24px", textAlign: "center",
            }}>
              <FilePlus style={{ width: "32px", height: "32px", color: "#1e2535", margin: "0 auto 12px" }} />
              <div style={{ color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px" }}>
                No hay informes
              </div>
              <div style={{ color: "#2a3550", fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", marginTop: "4px" }}>
                {status ? `No se encontraron informes en estado "${status}"` : "Aún no hay informes registrados"}
              </div>
            </div>
          ) : data?.items.map((r) => {
            const st = STATUS_CONFIG[r.status] || STATUS_CONFIG[""];
            const isHov = hoveredId === r.id;
            return (
              <Link
                key={r.id}
                href={`/reports/${r.id}`}
                style={{ textDecoration: "none" }}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div style={{
                  background: isHov ? "#1a2030" : "#131720",
                  border: `1px solid ${isHov ? "#2a3550" : "#1e2535"}`,
                  borderRadius: "8px", padding: isMobile ? "10px 12px" : "13px 16px",
                  display: "flex", alignItems: isMobile ? "flex-start" : "center",
                  flexDirection: isMobile ? "column" : "row",
                  gap: isMobile ? "8px" : "14px",
                  transition: "all 0.12s", cursor: "pointer",
                }}>
                  {/* Top row: icon + title + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "8px" : "14px", width: "100%" }}>
                    {/* Icon */}
                    <div style={{
                      width: isMobile ? "28px" : "34px", height: isMobile ? "28px" : "34px", borderRadius: isMobile ? "6px" : "7px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: r.has_alert ? "rgba(255,71,87,0.12)" : "rgba(138,154,184,0.06)",
                      border: `1px solid ${r.has_alert ? "rgba(255,71,87,0.25)" : "#1e2535"}`,
                    }}>
                      {r.has_alert
                        ? <AlertTriangle style={{ width: "15px", height: "15px", color: "#ff4757" }} />
                        : <FileText style={{ width: "15px", height: "15px", color: "#4a5878" }} />
                      }
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: isMobile ? "12px" : "13px", color: "#e8edf2", fontWeight: 500 }}>
                          {r.modalidad || "Estudio"} — {r.region_anatomica || "Sin región"}
                        </span>
                        {r.has_alert && (
                          <span style={{
                            fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                            color: "#ff4757", background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.25)",
                            borderRadius: "4px", padding: "1px 6px", letterSpacing: "0.04em",
                          }}>
                            ALERTA
                          </span>
                        )}
                      </div>
                      {!isMobile && r.patient_name && (
                        <span style={{ fontSize: "11px", color: "#8a9ab8", fontFamily: "IBM Plex Mono, monospace" }}>
                          {r.patient_name}{r.patient_rut ? ` · ${r.patient_rut}` : ""}
                        </span>
                      )}
                    </div>

                    {/* Status badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                      <span style={{
                        fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                        color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                        borderRadius: "5px", padding: "3px 9px", letterSpacing: "0.04em",
                      }}>
                        {r.status}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: meta info */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: isMobile ? "8px" : "12px",
                    flexWrap: "wrap",
                    paddingLeft: isMobile ? 0 : "48px",
                  }}>
                    {isMobile && r.patient_name && (
                      <span style={{ fontSize: "11px", color: "#8a9ab8", fontFamily: "IBM Plex Mono, monospace" }}>
                        {r.patient_name}{r.patient_rut ? ` · ${r.patient_rut}` : ""}
                      </span>
                    )}
                    {r.accession_number && (
                      <span style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
                        #{r.accession_number}
                      </span>
                    )}
                    <span style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
                      {formatDate(r.created_at)}
                    </span>
                    {!isMobile && (
                      <span style={{ fontSize: "11px", color: "#2a3550", fontFamily: "IBM Plex Mono, monospace" }}>
                        v{r.version}
                      </span>
                    )}
                    {r.assigned_to_name && (
                      <span style={{ fontSize: "10px", color: "rgba(245,158,11,0.6)", fontFamily: "IBM Plex Mono, monospace" }}>
                        → {r.assigned_to_name}
                      </span>
                    )}
                    {r.signed_by_name && (
                      <span style={{ fontSize: "10px", color: "rgba(46,213,115,0.6)", fontFamily: "IBM Plex Mono, monospace" }}>
                        ✓ {r.signed_by_name}
                      </span>
                    )}
                    {!r.patient_name && (
                      <button
                        onClick={(e) => openLinkModal(e, r)}
                        title="Vincular paciente"
                        style={{
                          display: "flex", alignItems: "center", gap: "4px",
                          padding: "4px 8px", background: "rgba(245,158,11,0.08)",
                          border: "1px solid rgba(245,158,11,0.3)", borderRadius: "5px",
                          color: "#f59e0b", fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                          fontWeight: 600, cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        <Link2 style={{ width: "10px", height: "10px" }} />
                        Vincular
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "24px" }}>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              style={{
                padding: "7px", background: "#131720", border: "1px solid #1e2535",
                borderRadius: "6px", color: page === 1 ? "#2a3550" : "#8a9ab8",
                cursor: page === 1 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", transition: "all 0.15s",
              }}
            >
              <ChevronLeft style={{ width: "15px", height: "15px" }} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => (
                p === "..." ? (
                  <span key={`ellipsis-${i}`} style={{ fontSize: "12px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", padding: "0 4px" }}>···</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    style={{
                      width: "32px", height: "32px", borderRadius: "6px",
                      background: page === p ? "rgba(0,212,255,0.1)" : "#131720",
                      border: `1px solid ${page === p ? "rgba(0,212,255,0.35)" : "#1e2535"}`,
                      color: page === p ? "#00d4ff" : "#8a9ab8",
                      fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", fontWeight: page === p ? 600 : 400,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {p}
                  </button>
                )
              ))
            }

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              style={{
                padding: "7px", background: "#131720", border: "1px solid #1e2535",
                borderRadius: "6px", color: page === totalPages ? "#2a3550" : "#8a9ab8",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", transition: "all 0.15s",
              }}
            >
              <ChevronRight style={{ width: "15px", height: "15px" }} />
            </button>
          </div>
        )}

        {!loading && data && (
          <div style={{ marginTop: "12px", textAlign: "center", fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
            Página {page} de {totalPages || 1} · {data.total} informes
          </div>
        )}
      </div>

      {/* ── Modal: Nuevo Informe ── */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: "#131720", border: "1px solid #2a3550", borderRadius: "10px",
            width: "100%", maxWidth: "560px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid #1e2535", background: "#0f1218",
            }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2" }}>Nuevo Informe Manual</div>
                <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "2px" }}>
                  Se creará como BORRADOR sin procesamiento AI
                </div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#4a5878", cursor: "pointer" }}>
                <X style={{ width: "16px", height: "16px" }} />
              </button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "5px", display: "block" }}>
                  N° Acceso (opcional)
                </label>
                <input
                  style={{ width: "100%", background: "#0f1218", border: "1px solid #1e2535", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", color: "#e8edf2", outline: "none" }}
                  placeholder="Ej: ACC-2024-001"
                  value={form.accession_number}
                  onChange={e => setForm(f => ({ ...f, accession_number: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "5px", display: "block" }}>
                  Texto del Informe <span style={{ color: "#ff4757" }}>*</span>
                </label>
                <textarea
                  rows={8}
                  style={{ width: "100%", background: "#0f1218", border: "1px solid #1e2535", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", fontFamily: "IBM Plex Sans, sans-serif", color: "#e8edf2", outline: "none", resize: "vertical", lineHeight: 1.6 }}
                  placeholder="Escriba el contenido del informe radiológico..."
                  value={form.texto}
                  onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e2535", display: "flex", gap: "10px", justifyContent: "flex-end", background: "#0f1218" }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: "8px 16px", background: "transparent", border: "1px solid #1e2535", borderRadius: "6px", color: "#8a9ab8", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving}
                style={{ padding: "8px 20px", background: saving ? "rgba(0,212,255,0.06)" : "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.35)", borderRadius: "6px", color: "#00d4ff", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                {saving
                  ? <><RefreshCw style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} /> Guardando...</>
                  : <><Plus style={{ width: "12px", height: "12px" }} /> Crear Informe</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Vincular Paciente ── */}
      {linkTarget && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
        }}
          onClick={e => { if (e.target === e.currentTarget) setLinkTarget(null); }}
        >
          <div style={{
            background: "#131720", border: "1px solid #2a3550", borderRadius: "10px",
            width: "100%", maxWidth: "580px", maxHeight: "80vh",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid #1e2535", background: "#0f1218",
            }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Link2 style={{ width: "14px", height: "14px", color: "#f59e0b" }} />
                  Vincular Paciente
                </div>
                <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "2px" }}>
                  {linkTarget.modalidad} — {linkTarget.region_anatomica || "Sin región"}
                </div>
              </div>
              <button onClick={() => setLinkTarget(null)} style={{ background: "none", border: "none", color: "#4a5878", cursor: "pointer" }}>
                <X style={{ width: "16px", height: "16px" }} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {wlLoading ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px" }}>
                  Cargando worklist...
                </div>
              ) : wlItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px" }}>
                  No hay estudios pendientes sin informe vinculado
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {wlItems.map((wl) => (
                    <button
                      key={wl.id}
                      disabled={linking}
                      onClick={() => handleLinkWorklist(wl.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 14px", background: "#0f1218",
                        border: "1px solid #1e2535", borderRadius: "7px",
                        cursor: linking ? "not-allowed" : "pointer", textAlign: "left",
                        transition: "all 0.12s", opacity: linking ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { if (!linking) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.4)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.05)"; } }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2535"; (e.currentTarget as HTMLButtonElement).style.background = "#0f1218"; }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", color: "#e8edf2", fontWeight: 500 }}>
                          {wl.patient_name || "Sin nombre"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "3px" }}>
                          {wl.patient_rut && <span>{wl.patient_rut} · </span>}
                          {wl.modalidad && <span>{wl.modalidad} · </span>}
                          {wl.accession_number && <span>#{wl.accession_number}</span>}
                        </div>
                      </div>
                      <span style={{
                        fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                        color: "#f59e0b", background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.25)", borderRadius: "4px", padding: "2px 8px",
                      }}>
                        {wl.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid #1e2535", background: "#0f1218", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setLinkTarget(null)}
                style={{ padding: "7px 16px", background: "transparent", border: "1px solid #1e2535", borderRadius: "6px", color: "#8a9ab8", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
