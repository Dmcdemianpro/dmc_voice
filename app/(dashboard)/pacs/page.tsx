"use client";

import { useState, useEffect, useCallback } from "react";
import { pacsApi } from "@/lib/api";
import { useMobileCtx } from "../layout";
import type { PacsStudy, PacsHealthResponse } from "@/types/pacs.types";
import {
  Search, RefreshCw, Monitor, ExternalLink, FileText,
  Calendar, User, Hash, Activity, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, Filter, X,
} from "lucide-react";

const mono = "var(--font-ibm-plex-mono), monospace";

const MODALITIES = ["CT", "MR", "US", "DX", "CR", "PT", "NM", "MG", "XA"];

export default function PacsPage() {
  const { isMobile } = useMobileCtx();
  const [studies, setStudies] = useState<PacsStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [pacsHealth, setPacsHealth] = useState<PacsHealthResponse | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  // Filters
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [modality, setModality] = useState("");
  const [studyDate, setStudyDate] = useState("");
  const [accessionNumber, setAccessionNumber] = useState("");

  const fetchStudies = useCallback(async (pg = 0) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit, offset: pg * limit };
      if (patientName) params.patient_name = patientName;
      if (patientId) params.patient_id = patientId;
      if (modality) params.modality = modality;
      if (studyDate) params.study_date = studyDate;
      if (accessionNumber) params.accession_number = accessionNumber;
      const data = await pacsApi.searchStudies(params as never);
      setStudies(data.results);
      setTotalCount(data.count);
      setPage(pg);
    } catch {
      setStudies([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [patientName, patientId, modality, studyDate, accessionNumber]);

  useEffect(() => {
    pacsApi.health().then(setPacsHealth).catch(() => setPacsHealth({ status: "error", detail: "Sin conexión" }));
    fetchStudies(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudies(0);
  };

  const clearFilters = () => {
    setPatientName(""); setPatientId(""); setModality(""); setStudyDate(""); setAccessionNumber("");
    setTimeout(() => fetchStudies(0), 0);
  };

  const formatDate = (d: string) => {
    if (!d || d.length !== 8) return d;
    return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  };

  return (
    <div style={{ fontFamily: mono, padding: isMobile ? 16 : 28, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
            PACS — Estudios DICOM
          </h1>
          <p style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", margin: "6px 0 0", letterSpacing: "0.02em" }}>
            Buscar estudios en DCM4CHEE · DMCPACS
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* PACS Status */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 5,
            background: pacsHealth?.status === "ok" ? "rgba(16,185,129,0.08)" : "rgba(255,71,87,0.08)",
            border: `1px solid ${pacsHealth?.status === "ok" ? "rgba(16,185,129,0.2)" : "rgba(255,71,87,0.2)"}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: pacsHealth?.status === "ok" ? "#10b981" : "#ff4757",
              boxShadow: `0 0 5px ${pacsHealth?.status === "ok" ? "#10b981" : "#ff4757"}`,
            }} />
            <span style={{ fontSize: 9, color: pacsHealth?.status === "ok" ? "#10b981" : "#ff4757", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {pacsHealth?.status === "ok" ? "PACS Online" : "PACS Offline"}
            </span>
          </div>
          <button
            onClick={() => fetchStudies(page)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 5, fontSize: 10,
              background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)",
              color: "#00d4ff", cursor: "pointer", fontFamily: mono, fontWeight: 500,
            }}
          >
            <RefreshCw size={11} /> Actualizar
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(148,163,184,0.5)" }} />
            <input
              value={patientName}
              onChange={e => setPatientName(e.target.value)}
              placeholder="Nombre paciente..."
              style={{
                width: "100%", padding: "10px 12px 10px 34px", borderRadius: 6,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(25,33,48,1)",
                color: "#e2e8f0", fontSize: 13, fontFamily: mono, outline: "none",
              }}
            />
          </div>
          <button type="button" onClick={() => setShowFilters(!showFilters)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "10px 14px", borderRadius: 6, fontSize: 11,
            background: showFilters ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${showFilters ? "rgba(0,212,255,0.3)" : "rgba(25,33,48,1)"}`,
            color: showFilters ? "#00d4ff" : "rgba(148,163,184,0.7)", cursor: "pointer", fontFamily: mono,
          }}>
            <Filter size={12} /> Filtros
          </button>
          <button type="submit" disabled={loading} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "10px 18px", borderRadius: 6, fontSize: 11,
            background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)",
            color: "#00d4ff", cursor: loading ? "not-allowed" : "pointer",
            fontFamily: mono, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Buscar
          </button>
        </div>
      </form>

      {/* Expanded Filters */}
      {showFilters && (
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 10,
          padding: 14, marginBottom: 16, borderRadius: 6,
          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,255,0.08)",
        }}>
          <div>
            <label style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 4 }}>
              RUT/ID Paciente
            </label>
            <input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="12345678-9"
              style={{ width: "100%", padding: "7px 10px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)", color: "#e2e8f0", fontSize: 12, fontFamily: mono, outline: "none" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 4 }}>
              Modalidad
            </label>
            <select value={modality} onChange={e => setModality(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)", color: "#e2e8f0", fontSize: 12, fontFamily: mono, outline: "none" }}
            >
              <option value="">Todas</option>
              {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 4 }}>
              Fecha Estudio
            </label>
            <input type="date" value={studyDate} onChange={e => setStudyDate(e.target.value.replace(/-/g, ""))}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)", color: "#e2e8f0", fontSize: 12, fontFamily: mono, outline: "none" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 4 }}>
              N° Acceso
            </label>
            <input value={accessionNumber} onChange={e => setAccessionNumber(e.target.value)} placeholder="ACC-001"
              style={{ width: "100%", padding: "7px 10px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)", color: "#e2e8f0", fontSize: 12, fontFamily: mono, outline: "none" }}
            />
          </div>
          <div style={{ gridColumn: isMobile ? "1" : "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={clearFilters} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 4,
              background: "transparent", border: "1px solid rgba(255,71,87,0.2)", color: "rgba(255,71,87,0.7)",
              fontSize: 10, cursor: "pointer", fontFamily: mono,
            }}>
              <X size={10} /> Limpiar filtros
            </button>
          </div>
        </div>
      )}

      {/* Results count */}
      <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginBottom: 10, letterSpacing: "0.05em" }}>
        {loading ? "Buscando..." : `${totalCount} estudio${totalCount !== 1 ? "s" : ""} encontrado${totalCount !== 1 ? "s" : ""}`}
      </div>

      {/* Studies Table / Cards */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "rgba(0,212,255,0.5)" }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : studies.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center", borderRadius: 8,
          background: "rgba(0,0,0,0.2)", border: "1px solid rgba(25,33,48,0.8)",
        }}>
          <Monitor size={28} style={{ color: "rgba(148,163,184,0.3)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", margin: 0 }}>
            No hay estudios. Los estudios DICOM aparecerán aquí cuando se envíen al PACS.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {studies.map(study => (
            <StudyCard key={study.study_instance_uid} study={study} formatDate={formatDate} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalCount > limit && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
          <button
            onClick={() => fetchStudies(page - 1)} disabled={page === 0}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 5,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)",
              color: page === 0 ? "rgba(148,163,184,0.3)" : "#e2e8f0", fontSize: 11,
              cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: mono,
            }}
          >
            <ChevronLeft size={12} /> Anterior
          </button>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
            Página {page + 1} de {Math.ceil(totalCount / limit)}
          </span>
          <button
            onClick={() => fetchStudies(page + 1)} disabled={(page + 1) * limit >= totalCount}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 5,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(25,33,48,1)",
              color: (page + 1) * limit >= totalCount ? "rgba(148,163,184,0.3)" : "#e2e8f0", fontSize: 11,
              cursor: (page + 1) * limit >= totalCount ? "not-allowed" : "pointer", fontFamily: mono,
            }}
          >
            Siguiente <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Study Card Component ─────────────────────────────────────────────────── */

function StudyCard({ study, formatDate }: { study: PacsStudy; formatDate: (d: string) => string }) {
  const modalityColor: Record<string, string> = {
    CT: "#f59e0b", MR: "#8b5cf6", US: "#10b981", DX: "#3b82f6",
    CR: "#3b82f6", PT: "#ef4444", NM: "#ec4899", MG: "#f97316", XA: "#06b6d4",
  };
  const color = modalityColor[study.modalities] || "#94a3b8";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
      borderRadius: 6, background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(25,33,48,0.8)", transition: "border-color 0.15s",
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.15)")}
    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(25,33,48,0.8)")}
    >
      {/* Modality badge */}
      <div style={{
        width: 42, height: 42, borderRadius: 6, flexShrink: 0,
        background: `${color}12`, border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color, letterSpacing: "0.05em",
      }}>
        {study.modalities || "?"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
            {study.patient_name || "Sin nombre"}
          </span>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
            {study.patient_id}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", marginTop: 3 }}>
          {study.study_description || "Sin descripción"}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
            <Calendar size={9} /> {formatDate(study.study_date)}
          </span>
          {study.accession_number && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
              <Hash size={9} /> {study.accession_number}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
            <Activity size={9} /> {study.num_series} series · {study.num_instances} img
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <a
          href={study.viewer_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: 5, fontSize: 10,
            background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)",
            color: "#00d4ff", textDecoration: "none", fontFamily: "var(--font-ibm-plex-mono), monospace",
            fontWeight: 500, whiteSpace: "nowrap",
          }}
        >
          <ExternalLink size={11} /> Ver Imágenes
        </a>
      </div>
    </div>
  );
}
