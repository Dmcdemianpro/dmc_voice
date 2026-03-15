"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { feedbackApi, type TrainingStats } from "@/lib/api";
import {
  BrainCircuit, Database, CheckSquare, TrendingUp,
  Clock, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Colores de tema ────────────────────────────────────────────────────────────
const C = {
  bg:      "#080b11",
  surface: "#111827",
  elevated:"#1a2235",
  border:  "rgba(0,212,255,0.18)",
  borderSub: "rgba(148,163,184,0.12)",
  cyan:    "#00d4ff",
  green:   "#10b981",
  orange:  "#f59e0b",
  red:     "#ff4757",
  muted:   "#94a3b8",
  sub:     "#64748b",
  text:    "#f1f5f9",
};

const mono = "var(--font-ibm-plex-mono), monospace";

// ── Helpers UI ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = C.cyan,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.borderSub}`,
      borderTop: `2px solid ${color}40`,
      borderRadius: 8,
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: `${color}18`, border: `1px solid ${color}35`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em", lineHeight: 1.3 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: C.sub }}>{sub}</div>}
    </div>
  );
}

// ── Bar chart simple con SVG ───────────────────────────────────────────────────

function BarChart({
  data, labelKey, valueKey, color = C.cyan, title, height = 140,
}: {
  data: Record<string, unknown>[]; labelKey: string; valueKey: string;
  color?: string; title: string; height?: number;
}) {
  if (!data.length) return (
    <div style={{ padding: 32, textAlign: "center", fontSize: 11, color: C.sub, letterSpacing: "0.05em" }}>
      Sin datos aún
    </div>
  );

  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  const barW = Math.max(20, Math.floor(560 / data.length) - 8);
  const svgH = height;

  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 12 }}>
        {title}
      </div>
      <svg width="100%" viewBox={`0 0 ${Math.max(data.length * (barW + 8), 200)} ${svgH + 28}`}
        style={{ overflow: "visible" }}>
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0;
          const barH = Math.max(2, (val / max) * svgH);
          const x = i * (barW + 8);
          const y = svgH - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={`${color}35`} stroke={`${color}80`} strokeWidth={1} rx={2} />
              <text x={x + barW / 2} y={svgH + 14}
                textAnchor="middle" fontSize={9} fill={C.muted} fontFamily={mono}>
                {String(d[labelKey])}
              </text>
              <text x={x + barW / 2} y={y - 4}
                textAnchor="middle" fontSize={9} fill={color} fontFamily={mono}>
                {val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Line chart simple con SVG ──────────────────────────────────────────────────

function LineChart({
  data, dateKey, valueKey, value2Key, color1 = C.cyan, color2 = C.green, title,
  label1 = "Antes", label2 = "Después",
}: {
  data: Record<string, unknown>[]; dateKey: string; valueKey: string; value2Key?: string;
  color1?: string; color2?: string; title: string; label1?: string; label2?: string;
}) {
  if (!data.length) return (
    <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: C.muted }}>
      Sin datos aún
    </div>
  );

  const W = 560; const H = 120;
  const vals1 = data.map(d => Number(d[valueKey]) || 0);
  const vals2 = value2Key ? data.map(d => Number(d[value2Key]) || 0) : [];
  const allVals = [...vals1, ...vals2].filter(v => v > 0);
  const max = Math.max(...allVals, 1);
  const step = W / Math.max(data.length - 1, 1);

  const pts = (vals: number[]) => vals
    .map((v, i) => `${i * step},${H - (v / max) * H}`)
    .join(" ");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em" }}>
          {title}
        </span>
        {value2Key && (
          <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 12, height: 2, background: color1 }} />
              <span style={{ fontSize: 9, color: C.muted }}>{label1}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 12, height: 2, background: color2 }} />
              <span style={{ fontSize: 9, color: C.muted }}>{label2}</span>
            </div>
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ overflow: "visible" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => (
          <line key={i} x1={0} y1={H * (1 - frac)} x2={W} y2={H * (1 - frac)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {/* Line 1 */}
        <polyline points={pts(vals1)} fill="none" stroke={color1} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round" />
        {vals1.map((v, i) => (
          <circle key={i} cx={i * step} cy={H - (v / max) * H} r={3}
            fill={color1} stroke={C.bg} strokeWidth={1.5} />
        ))}
        {/* Line 2 */}
        {value2Key && (
          <>
            <polyline points={pts(vals2)} fill="none" stroke={color2} strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round" />
            {vals2.map((v, i) => (
              <circle key={i} cx={i * step} cy={H - (v / max) * H} r={3}
                fill={color2} stroke={C.bg} strokeWidth={1.5} />
            ))}
          </>
        )}
        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={i * step} y={H + 14} textAnchor="middle"
            fontSize={8} fill={C.muted} fontFamily={mono}>
            {String(d[dateKey]).slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Tabla training examples ────────────────────────────────────────────────────

interface TrainingExample {
  id: string;
  transcript: string;
  corrected_text: string;
  modalidad: string | null;
  region_anatomica: string | null;
  quality_score: number | null;
  is_validated: boolean;
  used_for_fewshot: boolean;
  used_for_finetune: boolean;
  created_at: string;
}

function ExampleRow({
  ex, onValidate,
}: {
  ex: TrainingExample;
  onValidate: (id: string, validated: boolean, finetune: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <td style={{ padding: "8px 12px", fontSize: 10, color: C.muted }}>
          {ex.created_at.slice(0, 10)}
        </td>
        <td style={{ padding: "8px 12px", fontSize: 10, color: C.text }}>
          <span style={{
            padding: "1px 6px", borderRadius: 4, fontSize: 9,
            background: "rgba(0,212,255,0.08)", color: C.cyan, border: `1px solid ${C.cyan}25`,
          }}>
            {ex.modalidad || "—"}
          </span>
        </td>
        <td style={{ padding: "8px 12px", fontSize: 10, color: C.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ex.transcript}
        </td>
        <td style={{ padding: "8px 12px", fontSize: 10, color: ex.quality_score && ex.quality_score >= 0.7 ? C.green : C.orange }}>
          {ex.quality_score !== null ? (ex.quality_score * 100).toFixed(0) + "%" : "—"}
        </td>
        <td style={{ padding: "8px 12px" }}>
          <span style={{
            padding: "1px 6px", borderRadius: 4, fontSize: 9,
            background: ex.is_validated ? "rgba(16,185,129,0.12)" : "rgba(71,85,105,0.15)",
            color: ex.is_validated ? C.green : C.muted,
            border: `1px solid ${ex.is_validated ? C.green + "30" : "rgba(71,85,105,0.25)"}`,
          }}>
            {ex.is_validated ? "Validado" : "Pendiente"}
          </span>
        </td>
        <td style={{ padding: "8px 12px" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {!ex.is_validated && (
              <button
                type="button"
                onClick={() => onValidate(ex.id, true, ex.used_for_finetune)}
                style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer",
                  background: "rgba(16,185,129,0.1)", color: C.green,
                  border: `1px solid ${C.green}30`, fontFamily: mono,
                }}
              >
                Validar
              </button>
            )}
            {ex.is_validated && !ex.used_for_finetune && (
              <button
                type="button"
                onClick={() => onValidate(ex.id, true, true)}
                style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer",
                  background: "rgba(0,212,255,0.08)", color: C.cyan,
                  border: `1px solid ${C.cyan}25`, fontFamily: mono,
                }}
              >
                + Fine-tune
              </button>
            )}
            {ex.used_for_finetune && (
              <span style={{ fontSize: 9, color: C.cyan, padding: "2px 8px" }}>✓ FT</span>
            )}
          </div>
        </td>
        <td style={{ padding: "8px 12px" }}>
          <button
            type="button"
            onClick={() => setExpanded(p => !p)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2 }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: C.elevated }}>
          <td colSpan={7} style={{ padding: "10px 12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                  Transcript original
                </div>
                <div style={{ fontSize: 10.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {ex.transcript}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                  Texto corregido (firmado)
                </div>
                <div style={{ fontSize: 10.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {ex.corrected_text}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Página principal ────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "examples" | "wer">("overview");
  const [filterValidated, setFilterValidated] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const s = await feedbackApi.getStats();
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExamples = useCallback(async () => {
    setExamplesLoading(true);
    try {
      const data = await feedbackApi.getExamples({ validated_only: filterValidated, page: 1 });
      setExamples(data);
    } catch (e) {
      console.error(e);
    } finally {
      setExamplesLoading(false);
    }
  }, [filterValidated]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (activeTab === "examples") loadExamples();
  }, [activeTab, loadExamples]);

  const handleValidate = useCallback(async (id: string, validated: boolean, finetune: boolean) => {
    try {
      await feedbackApi.validateExample(id, validated, finetune);
      await loadExamples();
    } catch (e) {
      console.error(e);
    }
  }, [loadExamples]);

  const tabStyle = (tab: typeof activeTab) => ({
    padding: "6px 14px", borderRadius: 5, fontSize: 11, cursor: "pointer",
    fontFamily: mono, border: "1px solid transparent", transition: "all 0.15s",
    background: activeTab === tab ? "rgba(0,212,255,0.10)" : "transparent",
    color: activeTab === tab ? C.cyan : C.muted,
    borderColor: activeTab === tab ? "rgba(0,212,255,0.20)" : "transparent",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: mono }}>
      <Header
        title="Entrenamiento AI"
        subtitle="Feedback loop · Few-shot · Fine-tuning Whisper"
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, alignItems: "center" }}>
          <button type="button" style={tabStyle("overview")} onClick={() => setActiveTab("overview")}>
            Métricas
          </button>
          <button type="button" style={tabStyle("examples")} onClick={() => setActiveTab("examples")}>
            Ejemplos de entrenamiento
          </button>
          <button type="button" style={tabStyle("wer")} onClick={() => setActiveTab("wer")}>
            WER History
          </button>
          <button
            type="button"
            onClick={loading ? undefined : loadStats}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 5, fontSize: 10,
              background: "transparent", color: C.muted,
              border: `1px solid ${C.borderSub}`, cursor: "pointer", fontFamily: mono,
            }}
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard
                icon={Database} label="Sesiones de edición"
                value={stats?.total_sessions ?? "—"}
                sub="Cada dictado abierto"
                color={C.cyan}
              />
              <StatCard
                icon={TrendingUp} label="Pares de corrección"
                value={stats?.total_correction_pairs ?? "—"}
                sub="Original vs. firmado"
                color={C.green}
              />
              <StatCard
                icon={BrainCircuit} label="Ejemplos de entrenamiento"
                value={stats?.total_training_examples ?? "—"}
                sub="Auto-promovidos (diff ≤ 20%)"
                color={C.orange}
              />
              <StatCard
                icon={CheckSquare} label="Validados para FT"
                value={stats?.validated_examples ?? "—"}
                sub="Listos para fine-tuning"
                color={C.green}
              />
              <StatCard
                icon={TrendingUp} label="Diff score promedio"
                value={stats?.avg_diff_score != null ? stats.avg_diff_score.toFixed(1) + "%" : "—"}
                sub="Cambios sobre texto Claude"
                color={stats?.avg_diff_score != null && stats.avg_diff_score < 20 ? C.green : C.orange}
              />
              <StatCard
                icon={Clock} label="Tiempo firma prom."
                value={stats?.avg_time_to_sign_seconds != null
                  ? stats.avg_time_to_sign_seconds < 60
                    ? stats.avg_time_to_sign_seconds.toFixed(0) + "s"
                    : (stats.avg_time_to_sign_seconds / 60).toFixed(1) + "m"
                  : "—"}
                sub="Desde apertura a firma"
                color={C.cyan}
              />
            </div>

            {/* Charts row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* Diff score distribution */}
              <div style={{
                background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: 20,
              }}>
                <BarChart
                  title="Distribución diff score"
                  data={stats?.diff_score_distribution ?? []}
                  labelKey="range"
                  valueKey="count"
                  color={C.cyan}
                />
              </div>

              {/* Pares por modalidad */}
              <div style={{
                background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: 20,
              }}>
                <BarChart
                  title="Pares por modalidad"
                  data={Object.entries(stats?.pairs_by_modalidad ?? {}).map(([k, v]) => ({ range: k, count: v }))}
                  labelKey="range"
                  valueKey="count"
                  color={C.orange}
                />
              </div>
            </div>

            {/* Quality over time */}
            <div style={{
              background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: 20, marginBottom: 16,
            }}>
              <LineChart
                title="Calidad promedio semanal"
                data={(stats?.quality_over_time ?? []).map(q => ({
                  date: q.date ?? "",
                  value: (q.avg_quality ?? 0) * 100,
                  count: q.count,
                }))}
                dateKey="date"
                valueKey="value"
                color1={C.green}
              />
            </div>

            {/* Pipeline status */}
            <div style={{
              background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: 20,
            }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 14 }}>
                Estado del pipeline AI
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  {
                    label: "Prompt 1 — Feedback Loop",
                    done: (stats?.total_correction_pairs ?? 0) > 0,
                    detail: `${stats?.total_correction_pairs ?? 0} pares capturados`,
                    color: C.green,
                  },
                  {
                    label: "Prompt 2 — Few-Shot Learning",
                    done: (stats?.total_training_examples ?? 0) >= 5,
                    detail: `${stats?.total_training_examples ?? 0}/20 mínimo recomendado`,
                    color: (stats?.total_training_examples ?? 0) >= 5 ? C.green : C.orange,
                  },
                  {
                    label: "Prompt 3 — Fine-tuning Whisper",
                    done: (stats?.validated_examples ?? 0) >= 50,
                    detail: `${stats?.validated_examples ?? 0}/50 pares validados mínimo`,
                    color: (stats?.validated_examples ?? 0) >= 50 ? C.green : C.muted,
                  },
                ].map(({ label, done, detail, color }) => (
                  <div key={label} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 6,
                    background: C.elevated, border: `1px solid ${color}22`,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: done ? color : "rgba(71,85,105,0.4)",
                      boxShadow: done ? `0 0 6px ${color}` : "none",
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: done ? C.text : C.muted, fontWeight: done ? 500 : 400 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{detail}</div>
                    </div>
                    <span style={{ fontSize: 9, color: done ? color : C.muted, letterSpacing: "0.1em" }}>
                      {done ? "ACTIVO" : "PENDIENTE"}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: C.elevated, border: `1px solid ${C.borderSub}`, borderRadius: 6, fontSize: 10, color: C.muted, lineHeight: 1.7 }}>
                <strong style={{ color: C.text }}>Para iniciar fine-tuning:</strong>{" "}
                <code style={{ color: C.cyan }}>python scripts/prepare_dataset.py --output ./dataset</code>
                {" → "}
                <code style={{ color: C.cyan }}>python scripts/finetune_whisper.py --dataset ./dataset</code>
              </div>
            </div>
          </>
        )}

        {/* ── EXAMPLES ── */}
        {activeTab === "examples" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={filterValidated}
                  onChange={e => setFilterValidated(e.target.checked)}
                  style={{ accentColor: C.cyan }}
                />
                Solo validados
              </label>
              <div style={{ marginLeft: "auto", fontSize: 10, color: C.muted }}>
                {examples.length} ejemplos mostrados
              </div>
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.elevated }}>
                    {["Fecha", "Modalidad", "Transcript", "Calidad", "Estado", "Acciones", ""].map(h => (
                      <th key={h} style={{
                        padding: "10px 12px", textAlign: "left", fontSize: 9,
                        color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em",
                        fontWeight: 600, borderBottom: `1px solid ${C.borderSub}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examplesLoading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: "center", fontSize: 11, color: C.muted }}>
                        Cargando...
                      </td>
                    </tr>
                  ) : examples.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 32, textAlign: "center" }}>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          No hay ejemplos de entrenamiento aún
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(71,85,105,0.5)", marginTop: 6 }}>
                          Se generan automáticamente cuando el diff score ≤ 20%
                        </div>
                      </td>
                    </tr>
                  ) : (
                    examples.map(ex => (
                      <ExampleRow key={ex.id} ex={ex} onValidate={handleValidate} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── WER HISTORY ── */}
        {activeTab === "wer" && (
          <div>
            <div style={{
              background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: 20, marginBottom: 16,
            }}>
              <LineChart
                title="WER antes y después del fine-tuning"
                data={stats?.wer_history ?? []}
                dateKey="date"
                valueKey="wer_before"
                value2Key="wer_after"
                color1={C.red}
                color2={C.green}
                label1="WER base"
                label2="WER fine-tuned"
              />
            </div>

            {!stats?.wer_history?.length && (
              <div style={{
                background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 8,
                padding: 32, textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>Sin datos de WER</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                  El historial WER se genera ejecutando el script de evaluación luego de cada ciclo de fine-tuning.
                  Los resultados se almacenan en <code style={{ color: C.cyan }}>wer_results.json</code> y son poblados
                  manualmente en la base de datos.
                </div>
                <div style={{ marginTop: 16, padding: "12px 16px", background: C.elevated, border: `1px solid ${C.borderSub}`, borderRadius: 6, display: "inline-block", textAlign: "left" }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>Comandos:</div>
                  <code style={{ fontSize: 10, color: C.cyan, display: "block", lineHeight: 1.8 }}>
                    # Evaluar modelo base vs fine-tuned<br />
                    python scripts/evaluate_wer.py --compare \<br />
                    {"  "}--base openai/whisper-small \<br />
                    {"  "}--finetuned ./whisper-finetuned
                  </code>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
