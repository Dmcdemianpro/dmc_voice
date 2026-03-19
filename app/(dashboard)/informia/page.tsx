"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMobileCtx } from "../layout";
import { useAuthStore } from "@/store/authStore";
import { feedbackApi, pacsApi } from "@/lib/api";
import type { TrainingStats } from "@/lib/api";
import type { PacsStudy } from "@/types/pacs.types";
import {
  Sparkles, Activity, FileText, TrendingUp, Clock, Loader2,
  ArrowRight, Upload, Menu, Stethoscope, BarChart3, BookOpen,
} from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

const C = {
  bg: "#0d111a", surface: "#161f2e", elevated: "#1e2a3d",
  border: "rgba(0,212,255,0.18)", borderSub: "rgba(148,163,184,0.18)",
  cyan: "#00d4ff", green: "#10b981", red: "#ff4757",
  amber: "#f59e0b", purple: "#a78bfa",
  text: "#f1f5f9", sub: "#b0bfd4", muted: "#7a90aa",
};

export default function InformIAPage() {
  const { isMobile, toggleMenu } = useMobileCtx();
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [recentStudies, setRecentStudies] = useState<PacsStudy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [s, studies] = await Promise.allSettled([
          feedbackApi.getStats(),
          pacsApi.searchStudies({ limit: 5, offset: 0 }),
        ]);
        if (s.status === "fulfilled") setStats(s.value);
        if (studies.status === "fulfilled") setRecentStudies(studies.value.results);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statCards = [
    { label: "Informes Generados", value: stats?.total_training_examples ?? 0, icon: FileText, color: C.cyan },
    { label: "Correcciones", value: stats?.total_correction_pairs ?? 0, icon: TrendingUp, color: C.green },
    { label: "Validados", value: stats?.validated_examples ?? 0, icon: Activity, color: C.amber },
    { label: "Calidad Promedio", value: stats?.avg_diff_score != null ? `${(stats.avg_diff_score * 100).toFixed(0)}%` : "—", icon: BarChart3, color: C.purple },
  ];

  return (
    <div style={{ fontFamily: mono, padding: isMobile ? 16 : 28, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isMobile && (
            <button onClick={toggleMenu} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6, width: 34, height: 34, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "rgba(148,163,184,0.8)",
            }}>
              <Menu size={16} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles size={20} style={{ color: C.purple }} />
              InformIA
            </h1>
            <p style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", margin: "6px 0 0", letterSpacing: "0.02em" }}>
              Generación asistida de informes radiológicos con análisis DICOM
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "rgba(0,212,255,0.5)" }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 12, marginBottom: 24,
          }}>
            {statCards.map((s) => (
              <div key={s.label} style={{
                padding: 16, borderRadius: 8,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(25,33,48,0.8)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <s.icon size={12} style={{ color: s.color }} />
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
              Acciones Rápidas
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
              gap: 12,
            }}>
              <button onClick={() => router.push("/informia/generar")} style={{
                display: "flex", alignItems: "center", gap: 12, padding: 16,
                borderRadius: 8, background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.2)", cursor: "pointer",
                textAlign: "left", fontFamily: mono, transition: "border-color 0.15s",
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Sparkles size={16} style={{ color: C.purple }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Generar Informe</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    Subir DICOM o vincular estudio
                  </div>
                </div>
                <ArrowRight size={14} style={{ color: C.muted, marginLeft: "auto" }} />
              </button>

              <button onClick={() => router.push("/asistrad")} style={{
                display: "flex", alignItems: "center", gap: 12, padding: 16,
                borderRadius: 8, background: "rgba(0,212,255,0.04)",
                border: "1px solid rgba(0,212,255,0.15)", cursor: "pointer",
                textAlign: "left", fontFamily: mono, transition: "border-color 0.15s",
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FileText size={16} style={{ color: C.cyan }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Plantillas</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    Gestionar plantillas de informe
                  </div>
                </div>
                <ArrowRight size={14} style={{ color: C.muted, marginLeft: "auto" }} />
              </button>

              <button onClick={() => router.push("/pacs")} style={{
                display: "flex", alignItems: "center", gap: 12, padding: 16,
                borderRadius: 8, background: "rgba(16,185,129,0.04)",
                border: "1px solid rgba(16,185,129,0.15)", cursor: "pointer",
                textAlign: "left", fontFamily: mono, transition: "border-color 0.15s",
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Stethoscope size={16} style={{ color: C.green }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Buscar Estudios</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    Buscar en PACS y generar informe
                  </div>
                </div>
                <ArrowRight size={14} style={{ color: C.muted, marginLeft: "auto" }} />
              </button>
            </div>
          </div>

          {/* Recent Studies */}
          {recentStudies.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
                  Estudios Recientes
                </h2>
                <button onClick={() => router.push("/pacs")} style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                  borderRadius: 4, background: "transparent", border: "1px solid rgba(25,33,48,0.8)",
                  color: C.muted, fontSize: 9, cursor: "pointer", fontFamily: mono,
                }}>
                  Ver todos <ArrowRight size={9} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentStudies.map((study) => {
                  const modalityColor: Record<string, string> = {
                    CT: "#f59e0b", MR: "#8b5cf6", US: "#10b981", DX: "#3b82f6", CR: "#3b82f6",
                  };
                  const col = modalityColor[study.modalities] || "#94a3b8";
                  return (
                    <div key={study.study_instance_uid} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 6, background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(25,33,48,0.8)",
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: col,
                        width: 32, textAlign: "center", flexShrink: 0,
                      }}>
                        {study.modalities || "?"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {study.patient_name || "Sin nombre"}
                        </div>
                        <div style={{ fontSize: 9, color: C.muted }}>
                          {study.study_description || "Sin descripción"}
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/informia/generar?study_uid=${study.study_instance_uid}&modality=${study.modalities}&patient=${encodeURIComponent(study.patient_name)}&desc=${encodeURIComponent(study.study_description || "")}`)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                          borderRadius: 5, fontSize: 9, background: "rgba(139,92,246,0.08)",
                          border: "1px solid rgba(139,92,246,0.2)", color: C.purple,
                          cursor: "pointer", fontFamily: mono, fontWeight: 500, whiteSpace: "nowrap",
                        }}
                      >
                        <Sparkles size={9} /> Informar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tutorial link */}
          <div style={{
            marginTop: 24, padding: 16, borderRadius: 8,
            background: "rgba(139,92,246,0.03)", border: "1px solid rgba(139,92,246,0.12)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <BookOpen size={13} style={{ color: C.purple }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                Cómo funciona InformIA
              </span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: C.sub, fontSize: 10, lineHeight: 1.8 }}>
              <li>Busca un estudio en PACS o sube un archivo DICOM</li>
              <li>InformIA analiza los metadatos técnicos del estudio (modalidad, parámetros, hallazgos automáticos)</li>
              <li>Selecciona una plantilla y dicta los hallazgos clínicos</li>
              <li>La IA genera un pre-informe estructurado basado en la plantilla + contexto DICOM + tus hallazgos</li>
              <li>Revisa, edita y firma el informe final</li>
              <li>Cada corrección mejora los futuros informes (aprendizaje few-shot por radiólogo)</li>
            </ol>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
