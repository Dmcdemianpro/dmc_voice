"use client";

import { useEffect, useState, useCallback } from "react";
import { asistradApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { RadTemplate, RadTemplateCreate } from "@/types/asistrad.types";
import type { Modality, AnatomicalRegion } from "@/types/asistrad.types";
import { toast } from "sonner";
import {
  Sparkles, Plus, Pencil, Trash2, Eye, X,
  Stethoscope, MapPin, FileText, Loader2, Menu,
} from "lucide-react";
import { useMobileCtx } from "../layout";

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

type ModalMode = "create" | "edit" | "preview" | null;

export default function AsistRadPage() {
  const { user } = useAuthStore();
  const { isMobile, toggleMenu } = useMobileCtx();
  const canManage = user?.role === "ADMIN" || user?.role === "JEFE_SERVICIO";

  const [templates, setTemplates] = useState<RadTemplate[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [regions, setRegions] = useState<AnatomicalRegion[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterModality, setFilterModality] = useState<string>("");
  const [filterRegion, setFilterRegion] = useState<string>("");

  // Modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTemplate, setEditTemplate] = useState<RadTemplate | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formModality, setFormModality] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formText, setFormText] = useState("");
  const [formRegions, setFormRegions] = useState<AnatomicalRegion[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([
        asistradApi.getTemplates(filterModality || undefined, filterRegion || undefined),
        asistradApi.getModalities(),
      ]);
      setTemplates(t);
      setModalities(m);
    } catch {
      toast.error("Error al cargar plantillas");
    } finally {
      setLoading(false);
    }
  }, [filterModality, filterRegion]);

  useEffect(() => { load(); }, [load]);

  // Load regions when filter modality changes
  useEffect(() => {
    if (filterModality) {
      asistradApi.getRegions(filterModality).then(setRegions).catch(() => {});
    } else {
      setRegions([]);
      setFilterRegion("");
    }
  }, [filterModality]);

  // Load regions for form modality
  useEffect(() => {
    if (formModality) {
      asistradApi.getRegions(formModality).then(setFormRegions).catch(() => {});
    } else {
      setFormRegions([]);
    }
  }, [formModality]);

  const openCreate = () => {
    setFormName(""); setFormModality(""); setFormRegion("");
    setFormDescription(""); setFormText("");
    setEditTemplate(null);
    setModalMode("create");
  };

  const openEdit = (t: RadTemplate) => {
    setFormName(t.name); setFormModality(t.modality); setFormRegion(t.region);
    setFormDescription(t.description || ""); setFormText(t.template_text);
    setEditTemplate(t);
    setModalMode("edit");
  };

  const openPreview = (t: RadTemplate) => {
    setEditTemplate(t);
    setModalMode("preview");
  };

  const handleSave = async () => {
    if (!formName.trim() || !formModality || !formRegion || !formText.trim()) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    setSaving(true);
    try {
      if (modalMode === "create") {
        await asistradApi.createTemplate({
          name: formName,
          modality: formModality,
          region: formRegion,
          description: formDescription || undefined,
          template_text: formText,
        });
        toast.success("Plantilla creada");
      } else if (modalMode === "edit" && editTemplate) {
        await asistradApi.updateTemplate(editTemplate.id, {
          name: formName,
          description: formDescription || undefined,
          template_text: formText,
        });
        toast.success("Plantilla actualizada");
      }
      setModalMode(null);
      load();
    } catch {
      toast.error("Error al guardar plantilla");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: RadTemplate) => {
    if (!confirm(`Desactivar plantilla "${t.name}"?`)) return;
    try {
      await asistradApi.deleteTemplate(t.id);
      toast.success("Plantilla desactivada");
      load();
    } catch {
      toast.error("Error al desactivar");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: mono, background: C.bg }}>
      {/* Header */}
      <div style={{
        height: 52, flexShrink: 0, display: "flex", alignItems: "center",
        padding: isMobile ? "0 10px" : "0 20px",
        background: C.surface, borderBottom: `1px solid ${C.borderSub}`, gap: 8,
      }}>
        {isMobile && (
          <button onClick={toggleMenu} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, width: 34, height: 34, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "rgba(148,163,184,0.8)",
          }}>
            <Menu size={16} />
          </button>
        )}
        <Sparkles size={14} style={{ color: C.cyan }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          AsistRad — Plantillas
        </span>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>
          {templates.length} plantilla{templates.length !== 1 ? "s" : ""}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {/* Filters */}
          <select
            value={filterModality}
            onChange={(e) => { setFilterModality(e.target.value); setFilterRegion(""); }}
            style={{
              padding: "5px 8px", borderRadius: 4, background: C.elevated,
              border: `1px solid ${C.borderSub}`, color: C.text,
              fontSize: 10, fontFamily: mono, cursor: "pointer", outline: "none",
            }}
          >
            <option value="">Todas las modalidades</option>
            {modalities.map((m) => (
              <option key={m.code} value={m.code}>{m.code}</option>
            ))}
          </select>

          {filterModality && regions.length > 0 && (
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              style={{
                padding: "5px 8px", borderRadius: 4, background: C.elevated,
                border: `1px solid ${C.borderSub}`, color: C.text,
                fontSize: 10, fontFamily: mono, cursor: "pointer", outline: "none",
              }}
            >
              <option value="">Todas las regiones</option>
              {regions.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          )}

          {canManage && (
            <button
              onClick={openCreate}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
                borderRadius: 5, background: "rgba(0,212,255,0.1)",
                border: "1px solid rgba(0,212,255,0.3)", cursor: "pointer",
                color: C.cyan, fontSize: 10, fontWeight: 600, fontFamily: mono,
                letterSpacing: "0.1em",
              }}
            >
              <Plus size={11} /> Nueva
            </button>
          )}
        </div>
      </div>

      {/* Template list */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 10 : 20 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Loader2 size={20} style={{ color: C.cyan, animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 12 }}>
            No hay plantillas disponibles.
            {canManage && " Crea una nueva con el boton + Nueva."}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}>
            {templates.map((t) => (
              <div key={t.id} style={{
                background: C.surface, border: `1px solid ${C.borderSub}`,
                borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <FileText size={14} style={{ color: C.cyan, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.name}</div>
                    {t.description && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{t.description}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 9, padding: "2px 8px", borderRadius: 3,
                    background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)",
                    color: C.cyan, letterSpacing: "0.08em",
                  }}>
                    <Stethoscope size={8} style={{ marginRight: 3, verticalAlign: "middle" }} />
                    {t.modality}
                  </span>
                  <span style={{
                    fontSize: 9, padding: "2px 8px", borderRadius: 3,
                    background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.15)",
                    color: C.sub, letterSpacing: "0.08em",
                  }}>
                    <MapPin size={8} style={{ marginRight: 3, verticalAlign: "middle" }} />
                    {t.region}
                  </span>
                </div>

                <div style={{
                  fontSize: 10, color: C.muted, lineHeight: 1.5,
                  maxHeight: 60, overflow: "hidden",
                  whiteSpace: "pre-wrap",
                }}>
                  {t.template_text.substring(0, 200)}
                  {t.template_text.length > 200 && "..."}
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                  <button onClick={() => openPreview(t)} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                    borderRadius: 4, background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${C.borderSub}`, cursor: "pointer",
                    color: C.sub, fontSize: 9, fontFamily: mono,
                  }}>
                    <Eye size={10} /> Ver
                  </button>
                  {canManage && (
                    <>
                      <button onClick={() => openEdit(t)} style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                        borderRadius: 4, background: "rgba(0,212,255,0.04)",
                        border: "1px solid rgba(0,212,255,0.15)", cursor: "pointer",
                        color: C.cyan, fontSize: 9, fontFamily: mono,
                      }}>
                        <Pencil size={10} /> Editar
                      </button>
                      <button onClick={() => handleDelete(t)} style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                        borderRadius: 4, background: "rgba(255,71,87,0.04)",
                        border: "1px solid rgba(255,71,87,0.15)", cursor: "pointer",
                        color: C.red, fontSize: 9, fontFamily: mono,
                      }}>
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalMode && (
        <>
          <div
            onClick={() => setModalMode(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
            }}
          />
          <div style={{
            position: "fixed", zIndex: 1001,
            top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: isMobile ? "95%" : 640, maxHeight: "85vh",
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
              background: C.elevated, borderBottom: `1px solid ${C.borderSub}`,
              flexShrink: 0,
            }}>
              <Sparkles size={13} style={{ color: C.cyan }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>
                {modalMode === "create" ? "Nueva Plantilla" :
                 modalMode === "edit" ? "Editar Plantilla" : editTemplate?.name}
              </span>
              <button onClick={() => setModalMode(null)} style={{
                background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2,
              }}>
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {modalMode === "preview" && editTemplate ? (
                <div style={{
                  fontSize: 11, color: C.text, lineHeight: 1.7,
                  whiteSpace: "pre-wrap", fontFamily: mono,
                }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 3,
                      background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)", color: C.cyan,
                    }}>
                      {editTemplate.modality}
                    </span>
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 3,
                      background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.15)", color: C.sub,
                    }}>
                      {editTemplate.region}
                    </span>
                  </div>
                  {editTemplate.template_text}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Name */}
                  <div>
                    <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, display: "block" }}>
                      NOMBRE *
                    </label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ej: TC Cerebro sin contraste"
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 5,
                        background: C.elevated, border: `1px solid ${C.borderSub}`,
                        color: C.text, fontSize: 11, fontFamily: mono, outline: "none",
                      }}
                    />
                  </div>

                  {/* Modality + Region (only on create) */}
                  {modalMode === "create" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, display: "block" }}>
                          MODALIDAD *
                        </label>
                        <select
                          value={formModality}
                          onChange={(e) => { setFormModality(e.target.value); setFormRegion(""); }}
                          style={{
                            width: "100%", padding: "8px 10px", borderRadius: 5,
                            background: C.elevated, border: `1px solid ${C.borderSub}`,
                            color: C.text, fontSize: 11, fontFamily: mono, cursor: "pointer", outline: "none",
                          }}
                        >
                          <option value="">Seleccionar...</option>
                          {modalities.map((m) => (
                            <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, display: "block" }}>
                          REGION *
                        </label>
                        <select
                          value={formRegion}
                          onChange={(e) => setFormRegion(e.target.value)}
                          disabled={!formModality}
                          style={{
                            width: "100%", padding: "8px 10px", borderRadius: 5,
                            background: C.elevated, border: `1px solid ${C.borderSub}`,
                            color: C.text, fontSize: 11, fontFamily: mono, cursor: "pointer", outline: "none",
                          }}
                        >
                          <option value="">Seleccionar...</option>
                          {formRegions.map((r) => (
                            <option key={r.name} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, display: "block" }}>
                      DESCRIPCION
                    </label>
                    <input
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Descripcion breve de la plantilla"
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 5,
                        background: C.elevated, border: `1px solid ${C.borderSub}`,
                        color: C.text, fontSize: 11, fontFamily: mono, outline: "none",
                      }}
                    />
                  </div>

                  {/* Template text */}
                  <div>
                    <label style={{ fontSize: 9.5, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, display: "block" }}>
                      TEXTO DE PLANTILLA *
                    </label>
                    <textarea
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                      placeholder={"INFORME {{MODALIDAD}} — {{REGION}}\n\nTECNICA:\n{{tecnica}}\n\nHALLAZGOS:\n{{hallazgos}}\n\nIMPRESION DIAGNOSTICA:\n{{impresion}}\n\nRECOMENDACIONES:\n{{recomendaciones}}"}
                      rows={14}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 5,
                        background: C.elevated, border: `1px solid ${C.borderSub}`,
                        color: C.text, fontSize: 11, fontFamily: mono,
                        outline: "none", resize: "vertical", lineHeight: 1.6,
                      }}
                    />
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                      Usa {"{{variable}}"} para marcar campos que Claude debe completar.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            {modalMode !== "preview" && (
              <div style={{
                display: "flex", justifyContent: "flex-end", gap: 8,
                padding: "12px 16px", borderTop: `1px solid ${C.borderSub}`,
                flexShrink: 0,
              }}>
                <button onClick={() => setModalMode(null)} style={{
                  padding: "7px 14px", borderRadius: 5,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.borderSub}`,
                  cursor: "pointer", color: C.sub, fontSize: 10, fontFamily: mono,
                }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: "7px 14px", borderRadius: 5,
                  background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.35)",
                  cursor: saving ? "not-allowed" : "pointer",
                  color: C.cyan, fontSize: 10, fontWeight: 600, fontFamily: mono,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {saving && <Loader2 size={10} style={{ animation: "spin 0.7s linear infinite" }} />}
                  Guardar
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
