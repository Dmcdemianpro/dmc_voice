/**
 * useFeedbackCapture — Feedback Loop Hook
 *
 * Captura en tiempo real las diferencias entre el texto que generó Claude
 * y el texto que finalmente firmó el radiólogo.
 *
 * Responsabilidades:
 *  1. Iniciar una ReportSession cuando se carga el informe
 *  2. Rastrear edits y keystrokes mientras el radiólogo edita
 *  3. Buscar informes similares (few-shot) antes de llamar a Claude
 *  4. Al firmar: calcular diff, guardar CorrectionPair y cerrar sesión
 *
 * Uso en la página de dictado:
 *
 *   const fb = useFeedbackCapture({
 *     reportId: report.id,
 *     originalText: claudeResult?.texto_informe_final ?? "",
 *     transcript: transcript,
 *     modalidad: claudeResult?.estudio?.modalidad,
 *     audioDuration: audioDurationSecs,
 *   });
 *
 *   // En el editor, registrar cada cambio:
 *   <ReportEditor onChange={(text) => { fb.onTextChange(text); setReportText(text); }} />
 *
 *   // Antes de llamar a Claude:
 *   const examples = await fb.getSimilarExamples(transcript);
 *
 *   // Al firmar:
 *   await fb.onSign(currentEditorText);
 */
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { feedbackApi } from "@/lib/api";

interface FeedbackCaptureOptions {
  reportId: string | null;
  originalText: string;          // lo que generó Claude
  transcript: string;
  modalidad?: string;
  regionAnatomica?: string;
  audioDuration?: number;        // segundos del audio grabado
}

interface FeedbackState {
  sessionId: string | null;
  editCount: number;
  keystrokes: number;
  startedAt: Date | null;
  isSaving: boolean;
  /** Cuántos ejemplos few-shot se encontraron en la última búsqueda */
  fewshotCount: number;
  fewshotSimilarity: number;     // similitud promedio del mejor ejemplo (0-1)
  /** Diff score en tiempo real (0=idéntico, 100=completamente distinto) */
  liveDiffScore: number;
  /** Texto corregido actual (para pasar al DiffViewer) */
  currentText: string;
}

export function useFeedbackCapture({
  reportId,
  originalText,
  transcript,
  modalidad,
  regionAnatomica,
  audioDuration,
}: FeedbackCaptureOptions) {
  const [state, setState] = useState<FeedbackState>({
    sessionId: null,
    editCount: 0,
    keystrokes: 0,
    startedAt: null,
    isSaving: false,
    fewshotCount: 0,
    fewshotSimilarity: 0,
    liveDiffScore: 0,
    currentText: "",
  });

  // Ref para evitar re-render en cada keystroke
  const editCountRef  = useRef(0);
  const keystrokesRef = useRef(0);
  const startedAtRef  = useRef<Date | null>(null);
  const sessionIdRef  = useRef<string | null>(null);
  const lastTextRef   = useRef<string>("");

  // ── Iniciar sesión cuando se conoce el reportId ─────────────────────────────
  useEffect(() => {
    if (!reportId) return;

    const start = async () => {
      try {
        const session = await feedbackApi.startSession({
          report_id: reportId,
          audio_duration_seconds: audioDuration ?? null,
          transcript_length: transcript?.length ?? 0,
        });
        sessionIdRef.current = session.id;
        startedAtRef.current = new Date();
        setState(s => ({ ...s, sessionId: session.id, startedAt: new Date() }));
      } catch {
        // No bloquear el flujo si feedback falla
      }
    };

    start();
  // Solo iniciar cuando el reportId cambia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // ── Calcular diff score en tiempo real (cliente, sin llamada al backend) ──────
  const _computeLiveDiff = useCallback((original: string, current: string): number => {
    if (!original || !current) return 0;
    // Ratio de similitud simple por caracteres comunes (Dice coefficient)
    const a = original.toLowerCase();
    const b = current.toLowerCase();
    if (a === b) return 0;
    // Bigrams
    const bigrams = (s: string) => {
      const bg = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
      return bg;
    };
    const ba = bigrams(a);
    const bb = bigrams(b);
    let intersection = 0;
    ba.forEach(g => { if (bb.has(g)) intersection++; });
    const dice = (2 * intersection) / (ba.size + bb.size);
    return Math.round((1 - dice) * 100);
  }, []);

  // ── Registrar cambios en el editor ────────────────────────────────────────────
  const onTextChange = useCallback((newText: string) => {
    if (newText !== lastTextRef.current) {
      editCountRef.current += 1;
      keystrokesRef.current += Math.abs(newText.length - lastTextRef.current.length) + 1;
      lastTextRef.current = newText;
    }
    // Actualizar diff score y texto actual en estado (throttled: solo si cambió notablemente)
    setState(s => ({
      ...s,
      currentText: newText,
      liveDiffScore: _computeLiveDiff(s.currentText === newText ? s.currentText : newText, newText),
    }));
  }, [_computeLiveDiff]);

  // ── Buscar informes similares (few-shot) ──────────────────────────────────────
  const getSimilarExamples = useCallback(async (transcriptText: string, n = 5) => {
    if (!transcriptText || transcriptText.length < 20) return [];
    try {
      const results = await feedbackApi.findSimilar(transcriptText, n, modalidad);
      // Guardar cuántos se encontraron y similitud del mejor
      const bestSimilarity = results.length > 0 ? results[0].similarity_score : 0;
      setState(s => ({ ...s, fewshotCount: results.length, fewshotSimilarity: bestSimilarity }));
      return results;
    } catch {
      return [];
    }
  }, [modalidad]);

  // ── Al firmar: guardar el correction pair ──────────────────────────────────────
  const onSign = useCallback(async (correctedText: string) => {
    if (!reportId || !originalText) return;

    const timeToSign = startedAtRef.current
      ? (Date.now() - startedAtRef.current.getTime()) / 1000
      : null;

    setState(s => ({ ...s, isSaving: true }));

    try {
      await feedbackApi.saveCorrection({
        report_id: reportId,
        session_id: sessionIdRef.current ?? undefined,
        original_text: originalText,
        corrected_text: correctedText,
        modalidad: modalidad,
        region_anatomica: regionAnatomica,
        raw_transcript: transcript,
        edit_count: editCountRef.current,
        keystrokes: keystrokesRef.current,
        time_to_sign_seconds: timeToSign ?? undefined,
        audio_duration_seconds: audioDuration ?? undefined,
      });
    } catch {
      // Silencioso — el feedback no debe bloquear la firma
    } finally {
      setState(s => ({ ...s, isSaving: false }));
    }
  }, [reportId, originalText, transcript, modalidad, regionAnatomica, audioDuration]);

  return {
    sessionId:        state.sessionId,
    editCount:        editCountRef.current,
    keystrokes:       keystrokesRef.current,
    isSaving:         state.isSaving,
    // Few-shot learning
    fewshotCount:     state.fewshotCount,
    fewshotSimilarity: state.fewshotSimilarity,
    // Diff en tiempo real
    liveDiffScore:    state.liveDiffScore,
    currentText:      state.currentText,
    // El texto original de Claude (para el DiffViewer)
    originalText,
    onTextChange,
    getSimilarExamples,
    onSign,
  };
}
