"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Shield } from "lucide-react";

const ACTION_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  LOGIN:           { color: "#00d4ff", bg: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.25)",   icon: "→" },
  LOGOUT:          { color: "#4a5878", bg: "rgba(74,88,120,0.1)",    border: "#1e2535",                icon: "←" },
  PROCESS:         { color: "#8a9ab8", bg: "rgba(138,154,184,0.06)", border: "#1e2535",                icon: "⚙" },
  SIGN:            { color: "#2ed573", bg: "rgba(46,213,115,0.08)",  border: "rgba(46,213,115,0.25)",  icon: "✓" },
  EXPORT_PDF:      { color: "#ffa502", bg: "rgba(255,165,2,0.08)",   border: "rgba(255,165,2,0.25)",   icon: "↓" },
  SEND_RIS:        { color: "#00d4ff", bg: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.25)",   icon: "▶" },
  CREATE_USER:     { color: "#ffa502", bg: "rgba(255,165,2,0.08)",   border: "rgba(255,165,2,0.25)",   icon: "+" },
  UPDATE_USER:     { color: "#ffa502", bg: "rgba(255,165,2,0.08)",   border: "rgba(255,165,2,0.25)",   icon: "~" },
  DEACTIVATE_USER: { color: "#ff4757", bg: "rgba(255,71,87,0.08)",   border: "rgba(255,71,87,0.25)",   icon: "✕" },
  DELETE:          { color: "#ff4757", bg: "rgba(255,71,87,0.08)",   border: "rgba(255,71,87,0.25)",   icon: "✕" },
};

const DEFAULT_ACTION = { color: "#4a5878", bg: "rgba(74,88,120,0.08)", border: "#1e2535", icon: "·" };

export default function AuditPage() {
  const [data, setData] = useState<{ items: unknown[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.audit(page, 50)
      .then((r) => setData(r.data as { items: unknown[]; total: number }))
      .finally(() => setLoading(false));
  }, [page]);

  const items = (data?.items || []) as Array<{
    id: string; action: string; ip_address: string | null;
    detail: Record<string, unknown> | null; created_at: string;
    report_id: string | null; user_id: string | null;
  }>;
  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  // Group items by action for the summary
  const actionCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Log de Auditoría" subtitle={data ? `${data.total} eventos registrados` : ""} />

      <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>

        {/* Summary chips */}
        {!loading && Object.keys(actionCounts).length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
            {Object.entries(actionCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([action, count]) => {
                const cfg = ACTION_CONFIG[action] || DEFAULT_ACTION;
                return (
                  <div key={action} style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "4px 10px", background: cfg.bg, border: `1px solid ${cfg.border}`,
                    borderRadius: "20px",
                  }}>
                    <span style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: cfg.color, fontWeight: 600 }}>
                      {action}
                    </span>
                    <span style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: cfg.color, opacity: 0.6 }}>
                      {count}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {/* Table */}
        <div style={{ background: "#131720", border: "1px solid #1e2535", borderRadius: "8px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "150px 140px 1fr 110px 120px 1fr",
            background: "#0f1218", borderBottom: "1px solid #1e2535", padding: "0 4px",
          }}>
            {["Fecha", "Acción", "Usuario", "Informe", "IP", "Detalle"].map((h, i) => (
              <div key={i} style={{
                padding: "11px 12px", fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                color: "#4a5878", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
              }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "150px 140px 1fr 110px 120px 1fr",
                borderBottom: "1px solid #1a2030", padding: "0 4px",
              }}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} style={{ padding: "12px 12px" }}>
                    <div style={{ height: "10px", background: "#1a2030", borderRadius: "3px", animation: "pulse 1.5s ease-in-out infinite", width: j === 1 ? "60%" : "80%" }} />
                  </div>
                ))}
              </div>
            ))
          ) : items.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Shield style={{ width: "32px", height: "32px", color: "#1e2535", margin: "0 auto 12px" }} />
              <div style={{ color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px" }}>Sin eventos registrados</div>
            </div>
          ) : items.map((log, idx) => {
            const cfg = ACTION_CONFIG[log.action] || DEFAULT_ACTION;
            const isHov = hoveredRow === log.id;
            const isEven = idx % 2 === 0;
            return (
              <div
                key={log.id}
                style={{
                  display: "grid", gridTemplateColumns: "150px 140px 1fr 110px 120px 1fr",
                  borderBottom: "1px solid #1a2030", padding: "0 4px",
                  background: isHov ? "#1a2030" : (isEven ? "transparent" : "rgba(26,32,48,0.3)"),
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHoveredRow(log.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Fecha */}
                <div style={{ padding: "10px 12px", fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
                  {formatDate(log.created_at)}
                </div>

                {/* Acción */}
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                    color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                    borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.04em",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    <span style={{ opacity: 0.7 }}>{cfg.icon}</span>
                    {log.action}
                  </span>
                </div>

                {/* Usuario */}
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                  {log.user_id ? (
                    <span style={{
                      fontSize: "11px", fontFamily: "IBM Plex Mono, monospace",
                      color: "#8a9ab8", background: "rgba(138,154,184,0.06)",
                      border: "1px solid #1e2535", borderRadius: "4px", padding: "1px 6px",
                    }}>
                      {log.user_id.slice(0, 12)}…
                    </span>
                  ) : (
                    <span style={{ color: "#2a3550", fontFamily: "IBM Plex Mono, monospace", fontSize: "11px" }}>—</span>
                  )}
                </div>

                {/* Informe */}
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                  {log.report_id ? (
                    <span style={{ fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878" }}>
                      {log.report_id.slice(0, 8)}…
                    </span>
                  ) : (
                    <span style={{ color: "#2a3550", fontFamily: "IBM Plex Mono, monospace", fontSize: "11px" }}>—</span>
                  )}
                </div>

                {/* IP */}
                <div style={{ padding: "10px 12px", fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878", display: "flex", alignItems: "center" }}>
                  {log.ip_address || "—"}
                </div>

                {/* Detalle */}
                <div style={{
                  padding: "10px 12px", fontSize: "11px", fontFamily: "IBM Plex Mono, monospace",
                  color: "#4a5878", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center",
                }}>
                  {log.detail
                    ? <span title={JSON.stringify(log.detail, null, 2)} style={{ cursor: "help" }}>
                        {JSON.stringify(log.detail).slice(0, 55)}
                        {JSON.stringify(log.detail).length > 55 ? "…" : ""}
                      </span>
                    : "—"
                  }
                </div>
              </div>
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
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronLeft style={{ width: "15px", height: "15px" }} />
            </button>

            <span style={{ fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", color: "#8a9ab8", padding: "0 8px" }}>
              Página <strong style={{ color: "#00d4ff" }}>{page}</strong> / {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              style={{
                padding: "7px", background: "#131720", border: "1px solid #1e2535",
                borderRadius: "6px", color: page === totalPages ? "#2a3550" : "#8a9ab8",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronRight style={{ width: "15px", height: "15px" }} />
            </button>
          </div>
        )}

        {!loading && data && (
          <div style={{ marginTop: "10px", textAlign: "center", fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
            {data.total} eventos · mostrando {items.length} por página
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
