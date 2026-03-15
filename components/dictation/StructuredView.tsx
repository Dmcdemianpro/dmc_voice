"use client";

import type { ClaudeResponse } from "@/types/report.types";
import { Activity, Brain, Zap, ListChecks, AlertTriangle } from "lucide-react";

const C = {
  bg:       "#161f2e",
  elevated: "#1e2a3d",
  border:   "rgba(148,163,184,0.18)",
  cyan:     "#00d4ff",
  green:    "#10b981",
  amber:    "#f59e0b",
  red:      "#ff4757",
  text:     "#f1f5f9",
  sub:      "#b0bfd4",
  muted:    "#7a90aa",
};

const mono = "var(--font-ibm-plex-mono), monospace";

const SEVERITY_COLOR: Record<string, string> = {
  NORMAL:   C.green,
  LEVE:     C.amber,
  MODERADO: C.amber,
  SEVERO:   C.red,
  CRITICO:  C.red,
};

const CERTEZA_COLOR: Record<string, string> = {
  DEFINITIVO:   C.green,
  PROBABLE:     C.amber,
  POSIBLE:      C.amber,
  DESCARTADO:   C.muted,
};

function SectionHeader({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      marginBottom: 8,
    }}>
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <span style={{
        fontSize: 9.5, fontWeight: 700, color,
        textTransform: "uppercase", letterSpacing: "0.18em",
        fontFamily: mono,
      }}>
        {label}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: mono, fontWeight: 700,
      padding: "2px 7px",
      background: `${color}12`,
      border: `1px solid ${color}40`,
      borderRadius: 3,
      color,
      textTransform: "uppercase", letterSpacing: "0.1em",
    }}>
      {text}
    </span>
  );
}

interface StructuredViewProps {
  data: ClaudeResponse;
}

export function StructuredView({ data }: StructuredViewProps) {
  const { estudio, hallazgos, impresion_diagnostica, recomendaciones, metadata } = data;

  const confianzaColor = metadata.confianza_transcripcion === "ALTA" ? C.green
    : metadata.confianza_transcripcion === "MEDIA" ? C.amber
    : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: mono }}>

      {/* Header: Análisis IA + confianza */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        background: C.elevated,
        border: `1px solid ${C.border}`,
        borderRadius: 7,
      }}>
        <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em" }}>
          Análisis IA
        </span>
        <Badge text={`Confianza: ${metadata.confianza_transcripcion}`} color={confianzaColor} />
      </div>

      {/* Estudio */}
      {estudio.modalidad && (
        <div style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 7, padding: "10px 12px",
        }}>
          <SectionHeader icon={Activity} label="Estudio" color={C.cyan} />
          <Field label="Modalidad" value={estudio.modalidad} />
          <Field label="Región anatómica" value={estudio.region_anatomica} />
          {estudio.lateralidad && estudio.lateralidad !== "NO_APLICA" && (
            <Field label="Lateralidad" value={estudio.lateralidad} />
          )}
          {estudio.contraste && estudio.contraste !== "SIN_CONTRASTE" && (
            <Field label="Contraste" value={estudio.contraste} />
          )}
          {estudio.indicacion_clinica && (
            <Field label="Indicación clínica" value={estudio.indicacion_clinica} />
          )}
          {estudio.proyecciones.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                Proyecciones
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {estudio.proyecciones.map((p) => (
                  <Badge key={p} text={p} color={C.muted} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hallazgos */}
      {hallazgos.length > 0 && (
        <div style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 7, padding: "10px 12px",
        }}>
          <SectionHeader icon={Brain} label={`Hallazgos (${hallazgos.length})`} color={C.cyan} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hallazgos.map((h) => (
              <div key={h.id} style={{
                background: C.elevated,
                border: `1px solid ${h.es_critico ? `${C.red}50` : C.border}`,
                borderRadius: 5, padding: "8px 10px",
              }}>
                {h.region && (
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                    {h.region}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <p style={{ fontSize: 11.5, color: C.text, lineHeight: 1.6, margin: 0, flex: 1 }}>
                    {h.descripcion}
                  </p>
                  {h.severidad && (
                    <Badge text={h.severidad} color={SEVERITY_COLOR[h.severidad] ?? C.muted} />
                  )}
                </div>
                {h.snomed_display && (
                  <div style={{ marginTop: 5, fontSize: 9.5, color: C.muted, fontStyle: "italic" }}>
                    {h.snomed_display}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impresión diagnóstica */}
      {impresion_diagnostica.length > 0 && (
        <div style={{
          background: C.bg,
          border: `1px solid rgba(245,158,11,0.25)`,
          borderRadius: 7, padding: "10px 12px",
        }}>
          <SectionHeader icon={Zap} label={`Diagnósticos (${impresion_diagnostica.length})`} color={C.amber} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {impresion_diagnostica.map((dx) => (
              <div key={dx.id} style={{
                background: C.elevated,
                border: `1px solid ${C.border}`,
                borderRadius: 5, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <p style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5, margin: 0, fontWeight: 500, flex: 1 }}>
                    {dx.diagnostico}
                  </p>
                  {dx.certeza && (
                    <Badge text={dx.certeza} color={CERTEZA_COLOR[dx.certeza] ?? C.muted} />
                  )}
                </div>
                {(dx.cie10_code || dx.cie10_descripcion) && (
                  <div style={{ marginTop: 5, fontSize: 9.5, color: C.muted }}>
                    {dx.cie10_code && <span style={{ color: C.sub }}>CIE-10: {dx.cie10_code}</span>}
                    {dx.cie10_descripcion && <span> — {dx.cie10_descripcion}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendaciones */}
      {recomendaciones.texto.length > 0 && (
        <div style={{
          background: C.bg,
          border: `1px solid rgba(16,185,129,0.25)`,
          borderRadius: 7, padding: "10px 12px",
        }}>
          <SectionHeader icon={ListChecks} label="Recomendaciones" color={C.green} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {recomendaciones.texto.map((r, i) => (
              <div key={`rec-${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: `${C.green}80`, fontSize: 10, marginTop: 1, flexShrink: 0 }}>▸</span>
                <span style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.55 }}>{r}</span>
              </div>
            ))}
            {recomendaciones.urgencia_seguimiento && recomendaciones.urgencia_seguimiento !== "NO_REQUIERE" && (
              <div style={{
                marginTop: 6, paddingTop: 6,
                borderTop: `1px solid ${C.border}`,
                fontSize: 10, fontWeight: 700, color: C.amber,
                textTransform: "uppercase", letterSpacing: "0.1em",
              }}>
                Seguimiento: {recomendaciones.urgencia_seguimiento.replace(/_/g, " ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advertencias */}
      {metadata.advertencias.length > 0 && (
        <div style={{
          background: `rgba(245,158,11,0.05)`,
          border: `1px solid rgba(245,158,11,0.25)`,
          borderRadius: 7, padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <AlertTriangle size={12} style={{ color: C.amber }} />
            <span style={{ fontSize: 9.5, color: C.amber, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>
              Advertencias
            </span>
          </div>
          {metadata.advertencias.map((a, i) => (
            <p key={`warn-${i}`} style={{ fontSize: 11, color: `${C.amber}CC`, margin: "0 0 3px", lineHeight: 1.5 }}>{a}</p>
          ))}
        </div>
      )}
    </div>
  );
}
