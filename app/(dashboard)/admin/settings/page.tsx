"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi, type ClinicSettings } from "@/lib/api";
import { toast } from "sonner";
import { Settings2, Save, Loader2, Building2, Phone, Mail, MapPin, FileText, AlignLeft } from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

const C = {
  bg:      "#0d111a",
  surface: "#161f2e",
  elevated:"#1e2a3d",
  border:  "rgba(148,163,184,0.18)",
  cyan:    "#00d4ff",
  green:   "#10b981",
  text:    "#f1f5f9",
  sub:     "#b0bfd4",
  muted:   "#7a90aa",
};

type FormState = ClinicSettings;

const DEFAULTS: FormState = {
  institution_name: "",
  institution_subtitle: "",
  report_title: "",
  footer_text: "",
  address: "",
  phone: "",
  email: "",
};

function Field({
  label, icon: Icon, value, onChange, placeholder, multiline,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const inputStyle = {
    width: "100%", boxSizing: "border-box" as const,
    background: C.elevated, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.text,
    fontSize: 12, fontFamily: mono,
    padding: "8px 10px",
    outline: "none", resize: multiline ? "vertical" as const : "none" as const,
    lineHeight: 1.5,
    transition: "border-color 0.15s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        <Icon size={11} style={{ color: C.cyan, flexShrink: 0 }} />
        {label}
      </label>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = `rgba(0,212,255,0.4)`)}
          onBlur={e => (e.target.style.borderColor = C.border)}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = `rgba(0,212,255,0.4)`)}
          onBlur={e => (e.target.style.borderColor = C.border)}
        />
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then(r => {
      setForm({
        institution_name:     r.data.institution_name ?? "",
        institution_subtitle: r.data.institution_subtitle ?? "",
        report_title:         r.data.report_title ?? "",
        footer_text:          r.data.footer_text ?? "",
        address:              r.data.address ?? "",
        phone:                r.data.phone ?? "",
        email:                r.data.email ?? "",
      });
    }).catch(() => {
      toast.error("Error cargando configuración");
    }).finally(() => setLoading(false));
  }, []);

  const set = useCallback((key: keyof FormState) => (val: string) => {
    setForm(f => ({ ...f, [key]: val }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({
        ...form,
        footer_text: form.footer_text || null,
        address:     form.address || null,
        phone:       form.phone || null,
        email:       form.email || null,
      });
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  }, [form]);

  return (
    <div style={{ height: "100%", background: C.bg, fontFamily: mono, overflowY: "auto" }}>

      {/* Header */}
      <div style={{
        height: 52, display: "flex", alignItems: "center",
        padding: "0 20px", gap: 10,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 10,
      }}>
        <Settings2 size={14} style={{ color: C.cyan }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Configuración del Sistema</span>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.35)",
              borderRadius: 5, cursor: saving ? "not-allowed" : "pointer",
              color: C.green, fontSize: 11, fontWeight: 600,
              fontFamily: mono, letterSpacing: "0.08em", textTransform: "uppercase",
              opacity: saving ? 0.6 : 1, transition: "all 0.15s",
            }}
          >
            {saving
              ? <><Loader2 size={11} style={{ animation: "spin 0.7s linear infinite" }} /> Guardando</>
              : <><Save size={11} /> Guardar</>
            }
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
          <Loader2 size={22} style={{ color: C.muted, animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Institución */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Building2 size={13} style={{ color: C.cyan }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Datos de la Institución
              </span>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label="Nombre de la Institución"
                icon={Building2}
                value={form.institution_name}
                onChange={set("institution_name")}
                placeholder="Centro de Imágenes Médicas"
              />
              <Field
                label="Subtítulo / Servicio"
                icon={Building2}
                value={form.institution_subtitle}
                onChange={set("institution_subtitle")}
                placeholder="Servicio de Radiología e Imágenes"
              />
            </div>
          </section>

          {/* Plantilla PDF */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={13} style={{ color: C.cyan }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Plantilla del Informe PDF
              </span>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label="Título del Informe"
                icon={FileText}
                value={form.report_title}
                onChange={set("report_title")}
                placeholder="INFORME RADIOLÓGICO"
              />
              <Field
                label="Texto del pie de página"
                icon={AlignLeft}
                value={form.footer_text ?? ""}
                onChange={set("footer_text")}
                placeholder="Ej: Este informe es de uso exclusivo médico y confidencial..."
                multiline
              />
            </div>
          </section>

          {/* Contacto */}
          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={13} style={{ color: C.cyan }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Información de Contacto
              </span>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label="Dirección"
                icon={MapPin}
                value={form.address ?? ""}
                onChange={set("address")}
                placeholder="Av. Principal 1234, Santiago"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field
                  label="Teléfono"
                  icon={Phone}
                  value={form.phone ?? ""}
                  onChange={set("phone")}
                  placeholder="+56 2 2345 6789"
                />
                <Field
                  label="Email"
                  icon={Mail}
                  value={form.email ?? ""}
                  onChange={set("email")}
                  placeholder="contacto@clinica.cl"
                />
              </div>
            </div>
          </section>

          {/* Preview note */}
          <div style={{
            padding: "10px 14px",
            background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)",
            borderRadius: 7, fontSize: 11, color: C.muted, lineHeight: 1.6,
          }}>
            Los cambios se aplicarán en los nuevos PDFs generados. Los informes ya exportados no se modifican.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
