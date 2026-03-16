"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { adminApi, reportsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatRelative } from "@/lib/utils";
import {
  AlertTriangle, FileText, CheckCircle, Send,
  ArrowRight, RefreshCw, TrendingUp, Clock, PenLine, Inbox,
} from "lucide-react";
import Link from "next/link";
import type { Report } from "@/types/report.types";

interface Stats {
  total_reports: number; total_alerts: number;
  total_firmados: number; total_enviados: number; active_users: number;
}

interface MyStats {
  total: number;
  borrador: number;
  firmados: number;
}

const mono = "var(--font-ibm-plex-mono), monospace";

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  BORRADOR:    { color: "#8a9ab8", bg: "rgba(138,154,184,0.07)", border: "rgba(138,154,184,0.2)" },
  EN_REVISION: { color: "#ffa502", bg: "rgba(255,165,2,0.07)",   border: "rgba(255,165,2,0.25)" },
  FIRMADO:     { color: "#2ed573", bg: "rgba(46,213,115,0.07)",  border: "rgba(46,213,115,0.25)" },
  ENVIADO:     { color: "#00d4ff", bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.25)" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [alerts, setAlerts] = useState<Report[]>([]);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN" || user?.role === "JEFE_SERVICIO";

  const load = () => {
    setLoading(true);
    const myStatRequests = !isAdmin ? [
      reportsApi.list(1, 1).catch(() => null),
      reportsApi.list(1, 1, "BORRADOR").catch(() => null),
      reportsApi.list(1, 1, "FIRMADO").catch(() => null),
    ] : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)];

    Promise.all([
      isAdmin ? adminApi.stats().catch(() => null) : Promise.resolve(null),
      reportsApi.alerts().catch(() => ({ data: [] })),
      reportsApi.list(1, 5).catch(() => null),
      ...myStatRequests,
    ]).then(([statsRes, alertsRes, reportsRes, totalRes, borradorRes, firmadosRes]) => {
      if (statsRes) setStats((statsRes as { data: Stats }).data);
      setAlerts((alertsRes as { data: Report[] }).data || []);
      if (reportsRes) setRecentReports((reportsRes as { data: { items: Report[] } }).data.items || []);
      if (!isAdmin && totalRes && borradorRes && firmadosRes) {
        setMyStats({
          total: (totalRes as { data: { total: number } }).data.total,
          borrador: (borradorRes as { data: { total: number } }).data.total,
          firmados: (firmadosRes as { data: { total: number } }).data.total,
        });
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const adminCards = [
    {
      label: "Total Informes",
      value: stats?.total_reports ?? "—",
      icon: FileText,
      color: "#00d4ff",
      glow: "rgba(0,212,255,0.15)",
      border: "rgba(0,212,255,0.18)",
      bg: "rgba(0,212,255,0.05)",
    },
    {
      label: "Alertas Críticas",
      value: stats?.total_alerts ?? "—",
      icon: AlertTriangle,
      color: "#ff4757",
      glow: "rgba(255,71,87,0.15)",
      border: "rgba(255,71,87,0.18)",
      bg: "rgba(255,71,87,0.05)",
    },
    {
      label: "Firmados",
      value: stats?.total_firmados ?? "—",
      icon: CheckCircle,
      color: "#2ed573",
      glow: "rgba(46,213,115,0.15)",
      border: "rgba(46,213,115,0.18)",
      bg: "rgba(46,213,115,0.05)",
    },
    {
      label: "Enviados al RIS",
      value: stats?.total_enviados ?? "—",
      icon: Send,
      color: "#ffa502",
      glow: "rgba(255,165,2,0.15)",
      border: "rgba(255,165,2,0.18)",
      bg: "rgba(255,165,2,0.05)",
    },
  ];

  const radioCards = [
    {
      label: "Mis Informes",
      value: myStats?.total ?? "—",
      icon: FileText,
      color: "#00d4ff",
      glow: "rgba(0,212,255,0.15)",
      border: "rgba(0,212,255,0.18)",
      bg: "rgba(0,212,255,0.05)",
    },
    {
      label: "En Borrador",
      value: myStats?.borrador ?? "—",
      icon: PenLine,
      color: "#8a9ab8",
      glow: "rgba(138,154,184,0.15)",
      border: "rgba(138,154,184,0.18)",
      bg: "rgba(138,154,184,0.05)",
    },
    {
      label: "Firmados",
      value: myStats?.firmados ?? "—",
      icon: CheckCircle,
      color: "#2ed573",
      glow: "rgba(46,213,115,0.15)",
      border: "rgba(46,213,115,0.18)",
      bg: "rgba(46,213,115,0.05)",
    },
    {
      label: "Alertas Activas",
      value: alerts.length,
      icon: AlertTriangle,
      color: "#ff4757",
      glow: "rgba(255,71,87,0.15)",
      border: "rgba(255,71,87,0.18)",
      bg: "rgba(255,71,87,0.05)",
    },
  ];

  const statCards = isAdmin ? adminCards : radioCards;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: mono, background: "#080b11" }}>
      <Header title="Dashboard" subtitle={isAdmin ? "Resumen del sistema" : "Mi producción"} />

      <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>

        {/* Pending borradores CTA — radiologist only */}
        {!isAdmin && !loading && myStats && myStats.borrador > 0 && (
          <Link href="/reports?status=BORRADOR" style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", marginBottom: 20,
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 8, cursor: "pointer",
              transition: "background 0.15s",
            }}>
              <Inbox size={14} style={{ color: "#ffa502", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: "#ffa502", fontFamily: mono }}>
                Tienes <strong>{myStats.borrador}</strong> informe{myStats.borrador !== 1 ? "s" : ""} en borrador pendiente{myStats.borrador !== 1 ? "s" : ""} de firmar
              </span>
              <ArrowRight size={12} style={{ color: "rgba(255,165,2,0.5)" }} />
            </div>
          </Link>
        )}

        {/* Page header row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <div>
            <div style={{ fontSize: 9, color: "rgba(0,212,255,0.85)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 4 }}>
              Panel de control
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
              {isAdmin ? "Resumen del sistema" : "Mi producción"}
            </h2>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px",
              background: "rgba(0,212,255,0.06)",
              border: "1px solid rgba(0,212,255,0.2)",
              borderRadius: 6,
              color: loading ? "rgba(0,212,255,0.35)" : "#00d4ff",
              fontSize: 10.5, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: mono,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.15s ease",
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Actualizar
          </button>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {statCards.map(({ label, value, icon: Icon, color, glow, border, bg }) => (
            <div key={label} style={{
              background: "#0d1117",
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
              transition: "all 0.2s ease",
            }}>
              {/* Glow blob */}
              <div style={{
                position: "absolute", top: -20, right: -20,
                width: 80, height: 80,
                background: glow,
                borderRadius: "50%",
                filter: "blur(20px)",
                pointerEvents: "none",
              }} />
              {/* Corner accent */}
              <div style={{
                position: "absolute", top: 0, right: 0,
                width: 40, height: 40,
                borderBottom: `1px solid ${border}`,
                borderLeft: `1px solid ${border}`,
                borderRadius: "0 0 0 6px",
                background: bg,
              }} />

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
                <div>
                  <div style={{
                    fontSize: 8.5, color: "rgba(148,163,184,0.9)",
                    textTransform: "uppercase", letterSpacing: "0.18em",
                    marginBottom: 10,
                  }}>
                    {label}
                  </div>
                  {loading ? (
                    <div style={{
                      width: 40, height: 26,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 4,
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  ) : (
                    <div style={{
                      fontSize: 28, fontWeight: 700,
                      color,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      textShadow: `0 0 20px ${glow}`,
                    }}>
                      {value}
                    </div>
                  )}
                </div>
                <div style={{
                  width: 34, height: 34,
                  borderRadius: 7,
                  background: bg,
                  border: `1px solid ${border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={15} style={{ color }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Two column panels */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* Critical alerts panel */}
          <div style={{
            background: "#0d1117",
            border: "1px solid rgba(255,71,87,0.12)",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            {/* Panel header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255,71,87,0.08)",
              background: "rgba(255,71,87,0.03)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={13} style={{ color: "#ff4757" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.05em" }}>
                  Alertas Críticas
                </span>
              </div>
              {alerts.length > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: "#ff4757",
                  background: "rgba(255,71,87,0.1)",
                  border: "1px solid rgba(255,71,87,0.25)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  letterSpacing: "0.05em",
                }}>
                  {alerts.length} activa{alerts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div>
              {loading ? (
                <div style={{ padding: "18px" }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{
                      height: 12, background: "rgba(255,255,255,0.04)", borderRadius: 4,
                      marginBottom: 10, animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <div style={{ padding: "32px 18px", textAlign: "center" }}>
                  <CheckCircle size={20} style={{ color: "rgba(46,213,115,0.3)", marginBottom: 8 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.05em" }}>
                    Sin alertas críticas
                  </div>
                </div>
              ) : alerts.slice(0, 5).map((a, idx) => (
                <Link key={a.id} href={`/reports/${a.id}`} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "11px 18px",
                  borderBottom: idx < Math.min(alerts.length, 5) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  textDecoration: "none",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,71,87,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                  <div style={{
                    width: 6, height: 6,
                    borderRadius: "50%",
                    background: "#ff4757",
                    boxShadow: "0 0 6px rgba(255,71,87,0.7)",
                    flexShrink: 0,
                    marginTop: 3,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11.5, color: "#e2e8f0", fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      marginBottom: 3,
                    }}>
                      {a.alert_desc || "Alerta sin descripción"}
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(148,163,184,0.8)", letterSpacing: "0.05em" }}>
                      {a.modalidad} · {formatRelative(a.created_at)}
                    </div>
                  </div>
                  <ArrowRight size={11} style={{ color: "rgba(255,71,87,0.35)", flexShrink: 0, marginTop: 2 }} />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent reports panel */}
          <div style={{
            background: "#0d1117",
            border: "1px solid rgba(0,212,255,0.1)",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            {/* Panel header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid rgba(0,212,255,0.07)",
              background: "rgba(0,212,255,0.02)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={13} style={{ color: "#00d4ff" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.05em" }}>
                  Informes Recientes
                </span>
              </div>
              <Link href="/reports" style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 9.5, color: "rgba(0,212,255,0.6)",
                textDecoration: "none", letterSpacing: "0.08em",
                transition: "color 0.12s ease",
              }}>
                ver todos <ArrowRight size={9} />
              </Link>
            </div>

            <div>
              {loading ? (
                <div style={{ padding: "18px" }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{
                      height: 12, background: "rgba(255,255,255,0.04)", borderRadius: 4,
                      marginBottom: 10, animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  ))}
                </div>
              ) : recentReports.length === 0 ? (
                <div style={{ padding: "32px 18px", textAlign: "center" }}>
                  <Clock size={20} style={{ color: "rgba(0,212,255,0.2)", marginBottom: 8 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.05em" }}>
                    Sin informes recientes
                  </div>
                </div>
              ) : recentReports.map((r, idx) => {
                const st = STATUS_STYLES[r.status] || STATUS_STYLES.BORRADOR;
                return (
                  <Link key={r.id} href={`/reports/${r.id}`} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 18px",
                    borderBottom: idx < recentReports.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    textDecoration: "none",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11.5, color: "#e2e8f0", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 3,
                      }}>
                        {r.modalidad || "Estudio"} — {r.region_anatomica || "—"}
                      </div>
                      <div style={{ fontSize: 9.5, color: "rgba(148,163,184,0.8)", letterSpacing: "0.05em", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>{formatRelative(r.created_at)}</span>
                        {r.assigned_to_name && (
                          <span style={{ color: "rgba(245,158,11,0.5)" }}>→ {r.assigned_to_name}</span>
                        )}
                        {r.signed_by_name && (
                          <span style={{ color: "rgba(46,213,115,0.5)" }}>✓ {r.signed_by_name}</span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 600,
                      color: st.color,
                      background: st.bg,
                      border: `1px solid ${st.border}`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      letterSpacing: "0.06em",
                      flexShrink: 0,
                    }}>
                      {r.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid rgba(0,212,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }}>
            RIS Voice.AI · v1.0 · DMC Projects
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }}>
            Ley 19.628 · Protección datos personales
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
