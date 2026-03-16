"use client";

import { Bell, ChevronRight } from "lucide-react";
import { useReportStore } from "@/store/reportStore";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const mono = "var(--font-ibm-plex-mono), monospace";

export function Header({ title, subtitle }: HeaderProps) {
  const { alerts } = useReportStore();
  const alertCount = alerts.length;

  return (
    <header style={{
      height: 52,
      background: "rgba(7,9,15,0.95)",
      borderBottom: "1px solid rgba(0,212,255,0.07)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 12,
      position: "sticky",
      top: 0,
      zIndex: 20,
      backdropFilter: "blur(8px)",
      fontFamily: mono,
    }}>
      {/* Breadcrumb / title */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 9, color: "rgba(0,212,255,0.8)", textTransform: "uppercase", letterSpacing: "0.22em", flexShrink: 0 }}>
          RIS
        </span>
        <ChevronRight size={10} style={{ color: "rgba(0,212,255,0.2)", flexShrink: 0 }} />
        <h1 style={{
          fontSize: 13, fontWeight: 600,
          color: "#e2e8f0",
          letterSpacing: "0.02em",
          margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {title}
        </h1>
        {subtitle && (
          <>
            <ChevronRight size={10} style={{ color: "rgba(0,212,255,0.15)", flexShrink: 0 }} />
            <span style={{
              fontSize: 11, color: "rgba(148,163,184,0.85)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </span>
          </>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Alert bell */}
        <button style={{
          position: "relative",
          width: 32, height: 32,
          borderRadius: 6,
          background: alertCount > 0 ? "rgba(255,71,87,0.06)" : "rgba(255,255,255,0.03)",
          border: alertCount > 0 ? "1px solid rgba(255,71,87,0.2)" : "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.15s ease",
          color: alertCount > 0 ? "#ff4757" : "rgba(100,116,139,0.6)",
        }}>
          <Bell size={13} />
          {alertCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16,
              background: "#ff4757",
              borderRadius: 8,
              fontSize: 8.5, fontWeight: 700,
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px",
              border: "1.5px solid #07090f",
            }}>
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </button>

        {/* Timestamp */}
        <div style={{
          fontSize: 9, color: "rgba(255,255,255,0.85)",
          letterSpacing: "0.1em",
          padding: "4px 8px",
          background: "rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 4,
        }}>
          {new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} · {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "short" }).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
