"use client";

import { useRef, useEffect } from "react";
import { FileText } from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

interface TranscriptPanelProps {
  transcript: string;
  isRecording: boolean;
}

export function TranscriptPanel({ transcript, isRecording }: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: mono }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "#1e2a3d",
        borderBottom: "1px solid rgba(148,163,184,0.18)",
        flexShrink: 0,
      }}>
        <FileText size={13} style={{ color: "#00d4ff", flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.16em",
        }}>
          Transcripción
        </span>
        {isRecording && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#ff4757",
              boxShadow: "0 0 6px #ff4757",
              display: "inline-block",
            }} />
            <span style={{ fontSize: 9, color: "#ff4757", fontWeight: 700, letterSpacing: "0.12em" }}>EN VIVO</span>
          </div>
        )}
      </div>

      <div style={{
        flex: 1, overflowY: "auto", padding: "14px 16px",
        background: "#161f2e",
      }}>
        {transcript ? (
          <p style={{
            fontSize: 13, color: "#e2e8f0",
            lineHeight: 1.75, whiteSpace: "pre-wrap",
            fontFamily: "system-ui, -apple-system, sans-serif",
            margin: 0,
          }}>
            {transcript}
            {isRecording && (
              <span style={{
                display: "inline-block", width: 2, height: 14,
                background: "#00d4ff", marginLeft: 3,
                verticalAlign: "middle",
              }} />
            )}
          </p>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 10, opacity: 0.6,
            paddingTop: 24,
          }}>
            <FileText size={28} style={{ color: "#64748b" }} />
            <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
              Presiona el micrófono<br />para iniciar el dictado
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
