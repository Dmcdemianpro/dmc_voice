"use client";

import { useIdleStore } from "@/store/idleStore";
import { Clock, MousePointerClick } from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

interface Props {
  onStayLoggedIn: () => void;
}

export function IdleWarningModal({ onStayLoggedIn }: Props) {
  const { isWarningVisible, secondsRemaining } = useIdleStore();

  if (!isWarningVisible) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
  const isUrgent = secondsRemaining <= 30;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: mono,
      }}
    >
      <div
        style={{
          background: "#161f2e",
          border: `1px solid ${isUrgent ? "rgba(245,158,11,0.5)" : "rgba(245,158,11,0.3)"}`,
          borderRadius: 12,
          padding: "28px 32px",
          width: 380,
          maxWidth: "calc(100% - 32px)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
          }}
        >
          <Clock size={24} style={{ color: "#f59e0b" }} />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#f1f5f9",
            marginBottom: 6,
          }}
        >
          Sesion inactiva
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "#7a90aa",
            lineHeight: 1.6,
            marginBottom: 22,
          }}
        >
          Tu sesion se cerrara automaticamente por seguridad.
          {"\n"}Si tienes un borrador abierto, se guardara antes de cerrar.
        </div>

        {/* Countdown */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: isUrgent ? "#f59e0b" : "#00d4ff",
            letterSpacing: "0.08em",
            marginBottom: 6,
            transition: "color 0.3s",
          }}
        >
          {timeStr}
        </div>
        <div
          style={{
            fontSize: 9.5,
            color: "#7a90aa",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            marginBottom: 24,
          }}
        >
          Tiempo restante
        </div>

        {/* Stay button */}
        <button
          onClick={onStayLoggedIn}
          style={{
            width: "100%",
            padding: "13px 20px",
            background:
              "linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(0,190,230,0.08) 100%)",
            border: "1px solid rgba(0,212,255,0.4)",
            borderRadius: 7,
            color: "#00d4ff",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: mono,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s",
          }}
        >
          <MousePointerClick size={14} />
          Seguir trabajando
        </button>
      </div>
    </div>
  );
}
