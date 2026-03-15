"use client";

import { AlertTriangle, Phone, X } from "lucide-react";
import { useState } from "react";
import type { ClaudeAlertaCritica } from "@/types/report.types";
import { cn } from "@/lib/utils";

interface AlertBannerProps {
  alert: ClaudeAlertaCritica;
  onDismiss?: () => void;
}

export function AlertBanner({ alert, onDismiss }: AlertBannerProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!alert.activa) return null;

  return (
    <div
      className={cn(
        "relative rounded-sm border-2 border-red-alert bg-red-dim overflow-hidden",
        "animate-fade-in",
        !acknowledged && "alert-pulse"
      )}
    >
      {/* Scan line effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(255,71,87,0.04) 50%, transparent 100%)",
        }}
      />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Pulsing icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className={cn(
              "w-8 h-8 rounded-sm flex items-center justify-center bg-red-alert",
              !acknowledged && "animate-pulse"
            )}>
              <AlertTriangle className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-700 text-red-alert uppercase tracking-widest">
                ⚠ HALLAZGO CRÍTICO — NOTIFICACIÓN INMEDIATA REQUERIDA
              </span>
            </div>
            <p className="text-sm text-text-primary font-medium leading-relaxed">
              {alert.descripcion}
            </p>
            {alert.accion_requerida && (
              <p className="text-xs text-red-alert/80 mt-1.5 font-mono">
                {alert.accion_requerida}
              </p>
            )}
            {alert.timestamp_deteccion && (
              <p className="text-xs text-text-muted mt-1 font-mono">
                Detectado: {new Date(alert.timestamp_deteccion).toLocaleString("es-CL")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setAcknowledged(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-alert text-white text-xs font-mono font-semibold rounded-sm hover:bg-red-500 transition-colors"
            >
              <Phone className="w-3 h-3" />
              NOTIFICAR
            </button>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1.5 text-text-muted hover:text-text-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {acknowledged && (
          <div className="mt-3 pt-3 border-t border-red-alert/30">
            <p className="text-xs text-green-accent font-mono">
              ✓ Alerta reconocida. Asegúrese de notificar al médico tratante de forma inmediata.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
