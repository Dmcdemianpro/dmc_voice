"use client";

/**
 * DiffViewer — Visualizador de diferencias entre texto original (Claude) y texto corregido.
 *
 * Calcula un diff a nivel de palabras en el cliente y lo renderiza con:
 *   - Verde: palabras añadidas por el radiólogo
 *   - Rojo tachado: palabras eliminadas del texto original
 *   - Gris: palabras sin cambios
 *
 * No llama a ningún endpoint — el diff es puramente local para feedback visual inmediato.
 */

import { useMemo } from "react";

const C = {
  added:       "#10b981",
  addedBg:     "rgba(16,185,129,0.12)",
  addedBorder: "rgba(16,185,129,0.3)",
  deleted:       "#ff4757",
  deletedBg:     "rgba(255,71,87,0.10)",
  deletedBorder: "rgba(255,71,87,0.25)",
  unchanged:   "#b0bfd4",
  muted:       "#7a90aa",
  surface:     "#161f2e",
  elevated:    "#1e2a3d",
  border:      "rgba(148,163,184,0.15)",
  cyan:        "#00d4ff",
};

const mono = "var(--font-ibm-plex-mono), monospace";

// ── Diff engine (LCS word-level) ──────────────────────────────────────────────

type DiffOp = { op: "equal" | "insert" | "delete"; text: string };

function tokenize(text: string): string[] {
  // Divide preservando espacios y saltos de línea como tokens
  return text.split(/(\s+)/).filter(t => t.length > 0);
}

function computeWordDiff(original: string, corrected: string): DiffOp[] {
  const origTokens = tokenize(original);
  const corrTokens = tokenize(corrected);

  if (!origTokens.length && !corrTokens.length) return [];
  if (!origTokens.length) return corrTokens.map(t => ({ op: "insert" as const, text: t }));
  if (!corrTokens.length) return origTokens.map(t => ({ op: "delete" as const, text: t }));

  const m = origTokens.length;
  const n = corrTokens.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origTokens[i - 1] === corrTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const ops: DiffOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === corrTokens[j - 1]) {
      ops.push({ op: "equal", text: origTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ op: "insert", text: corrTokens[j - 1] });
      j--;
    } else {
      ops.push({ op: "delete", text: origTokens[i - 1] });
      i--;
    }
  }
  return ops.reverse();
}

// ── Stats ────────────────────────────────────────────────────────────────────

function computeStats(ops: DiffOp[]) {
  let added = 0, deleted = 0, unchanged = 0;
  for (const op of ops) {
    const words = op.text.trim().split(/\s+/).filter(w => w.length > 0).length;
    if (op.op === "insert")  added    += words;
    else if (op.op === "delete") deleted  += words;
    else                         unchanged += words;
  }
  const total = added + deleted + unchanged;
  const similarity = total > 0 ? Math.round(((unchanged) / (unchanged + Math.max(added, deleted))) * 100) : 100;
  return { added, deleted, unchanged, similarity };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  original: string;
  corrected: string;
  /** Mostrar solo estadísticas sin el texto completo */
  statsOnly?: boolean;
  /** Altura máxima del área de texto */
  maxHeight?: number;
}

export function DiffViewer({ original, corrected, statsOnly = false, maxHeight = 260 }: DiffViewerProps) {
  const ops = useMemo(() => computeWordDiff(original, corrected), [original, corrected]);
  const stats = useMemo(() => computeStats(ops), [ops]);

  const hasChanges = stats.added > 0 || stats.deleted > 0;

  return (
    <div style={{ fontFamily: mono }}>

      {/* ── Stats bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: C.elevated,
        borderRadius: statsOnly ? 6 : "6px 6px 0 0",
        border: `1px solid ${C.border}`,
        borderBottom: statsOnly ? undefined : "none",
        flexWrap: "wrap" as const,
      }}>
        {!hasChanges ? (
          <span style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
            Sin cambios respecto al texto generado por IA
          </span>
        ) : (
          <>
            <span style={{
              fontSize: 9.5, padding: "2px 7px", borderRadius: 4,
              background: C.addedBg, color: C.added, border: `1px solid ${C.addedBorder}`,
              letterSpacing: "0.06em",
            }}>
              +{stats.added} palabras
            </span>
            <span style={{
              fontSize: 9.5, padding: "2px 7px", borderRadius: 4,
              background: C.deletedBg, color: C.deleted, border: `1px solid ${C.deletedBorder}`,
              letterSpacing: "0.06em",
            }}>
              -{stats.deleted} palabras
            </span>
            <span style={{ fontSize: 9.5, color: C.muted }}>
              similitud {stats.similarity}%
            </span>
          </>
        )}

        {/* Indicador de calidad para aprendizaje */}
        {hasChanges && (
          <span style={{
            marginLeft: "auto", fontSize: 9, letterSpacing: "0.1em",
            color: stats.similarity >= 80 ? C.added : stats.similarity >= 50 ? "#f59e0b" : C.deleted,
          }}>
            {stats.similarity >= 80
              ? "BUENO PARA ENTRENAMIENTO"
              : stats.similarity >= 50
              ? "REVISIÓN MODERADA"
              : "REESCRITURA EXTENSA"}
          </span>
        )}
      </div>

      {/* ── Diff text ── */}
      {!statsOnly && (
        <div style={{
          padding: "12px 14px",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          maxHeight,
          overflowY: "auto",
          fontSize: 11.5,
          lineHeight: 1.8,
          color: C.unchanged,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {ops.map((op, i) => {
            if (op.op === "equal") {
              return <span key={i} style={{ color: C.unchanged }}>{op.text}</span>;
            }
            if (op.op === "insert") {
              return (
                <span key={i} style={{
                  color: C.added,
                  background: C.addedBg,
                  borderRadius: 2,
                  padding: "0 1px",
                }}>
                  {op.text}
                </span>
              );
            }
            // delete
            return (
              <span key={i} style={{
                color: C.deleted,
                background: C.deletedBg,
                borderRadius: 2,
                padding: "0 1px",
                textDecoration: "line-through",
                opacity: 0.8,
              }}>
                {op.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
