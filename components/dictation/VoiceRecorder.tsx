"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  // Minimal Web Speech API types (not in all TS dom libs)
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onresult: ((e: SpeechRecognitionEvent) => void) | null;
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }
}

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Radio, AlertCircle } from "lucide-react";
import { dictationApi } from "@/lib/api";
import { toast } from "sonner";

const mono = "var(--font-ibm-plex-mono), monospace";

interface VoiceRecorderProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onTranscript, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState<"webSpeech" | "whisper">("webSpeech");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [btnHover, setBtnHover] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const SR = typeof window !== "undefined"
      ? (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition)
      : null;
    if (!SR) setMode("whisper");
    return () => { stopAll(); };
  }, []);

  const stopAll = useCallback(() => {
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  }, []);

  const trackAudioLevel = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(dataArr);
      const max = Math.max(...Array.from(dataArr).map((v) => Math.abs(v - 128)));
      setAudioLevel(Math.min(100, (max / 128) * 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startWebSpeech = useCallback(() => {
    const SR = window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { setMode("whisper"); startWhisper(); return; }

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "es-CL";
    r.maxAlternatives = 1;

    let finalText = "";
    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      onTranscript(finalText + interim, false);
    };
    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(`Error STT: ${e.error}`);
      setIsRecording(false);
    };
    r.onend = () => { if (isRecording) r.start(); };

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      streamRef.current = stream;
      trackAudioLevel(stream);
    }).catch(() => {});

    r.start();
    recognitionRef.current = r;
  }, [onTranscript, isRecording, trackAudioLevel]);

  const startWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      trackAudioLevel(stream);
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const { data } = await dictationApi.transcribeWhisper(blob);
          onTranscript(data.text, true);
        } catch {
          toast.error("Error al transcribir el audio");
        }
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
    } catch {
      setError("No se pudo acceder al micrófono");
      setIsRecording(false);
    }
  }, [onTranscript, trackAudioLevel]);

  const toggle = useCallback(() => {
    if (isRecording) {
      stopAll();
      setIsRecording(false);
      setSeconds(0);
    } else {
      setError(null);
      setIsRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      if (mode === "webSpeech") startWebSpeech();
      else startWhisper();
    }
  }, [isRecording, mode, startWebSpeech, startWhisper, stopAll]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Genera alturas de barras con animación
  const barHeights = Array.from({ length: 9 }).map((_, i) => {
    if (!isRecording) return 3;
    const base = (audioLevel / 100) * 28;
    const wave = Math.sin((Date.now() / 200) + i * 0.8) * 6;
    return Math.max(3, base + wave + Math.random() * 4);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", fontFamily: mono }}>

      {/* Barras de onda */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 3, height: 36, width: "100%",
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: isRecording ? `${Math.max(4, (audioLevel / 100) * 32 + Math.sin(i * 1.2) * 8)}px` : "4px",
              borderRadius: 3,
              background: isRecording
                ? `rgba(0,212,255,${0.6 + (audioLevel / 100) * 0.4})`
                : "rgba(148,163,184,0.45)",
              transition: "height 0.08s ease, background 0.2s ease",
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Botón principal */}
      <button
        onClick={toggle}
        disabled={disabled}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        style={{
          width: 64, height: 64,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "all 0.2s ease",
          background: isRecording
            ? "rgba(255,71,87,0.12)"
            : btnHover
              ? "rgba(0,212,255,0.12)"
              : "rgba(0,212,255,0.06)",
          border: `2px solid ${isRecording
            ? "rgba(255,71,87,0.6)"
            : btnHover
              ? "rgba(0,212,255,0.6)"
              : "rgba(0,212,255,0.25)"}`,
          boxShadow: isRecording
            ? "0 0 20px rgba(255,71,87,0.2)"
            : btnHover
              ? "0 0 20px rgba(0,212,255,0.15)"
              : "none",
          color: isRecording ? "#ff4757" : "#00d4ff",
        }}
      >
        {isRecording
          ? <Square size={22} style={{ fill: "#ff4757" }} />
          : <Mic size={22} />
        }
        {/* Pulso cuando graba */}
        {isRecording && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            width: 10, height: 10,
            background: "#ff4757",
            borderRadius: "50%",
            boxShadow: "0 0 8px #ff4757",
            animation: "pulse 1.2s ease-in-out infinite",
          }} />
        )}
      </button>

      {/* Timer o modo */}
      <div style={{ textAlign: "center", minHeight: 18 }}>
        {isRecording ? (
          <span style={{
            fontSize: 15, fontWeight: 700, color: "#ff4757",
            letterSpacing: "0.08em",
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatTime(seconds)}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: "#94a3b8", letterSpacing: "0.1em" }}>
            {mode === "webSpeech" ? "Web Speech API" : "Whisper"}
          </span>
        )}
      </div>

      {/* Toggle de modo */}
      <button
        onClick={() => setMode((m) => m === "webSpeech" ? "whisper" : "webSpeech")}
        disabled={isRecording}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px",
          background: "transparent",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: 5,
          cursor: isRecording ? "not-allowed" : "pointer",
          color: isRecording ? "rgba(148,163,184,0.35)" : "#94a3b8",
          fontSize: 11, fontFamily: mono,
          transition: "all 0.15s",
          opacity: isRecording ? 0.4 : 1,
        }}
        onMouseEnter={e => { if (!isRecording) (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
        onMouseLeave={e => { if (!isRecording) (e.currentTarget as HTMLElement).style.color = "rgba(148,163,184,0.55)"; }}
      >
        <Radio size={11} />
        {mode === "webSpeech" ? "Cambiar a Whisper" : "Cambiar a Web Speech"}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 10, color: "#ff4757", fontFamily: mono,
        }}>
          <AlertCircle size={11} />
          {error}
        </div>
      )}
    </div>
  );
}
