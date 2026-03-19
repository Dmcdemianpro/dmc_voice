"use client";

import { useState, useEffect } from "react";
import { X, Search, Loader2, ExternalLink, Link as LinkIcon, CheckCircle, Image as ImageIcon } from "lucide-react";
import type { WorklistItem } from "@/types/report.types";
import type { PacsStudy } from "@/types/pacs.types";
import { worklistApi } from "@/lib/api";
import { toast } from "sonner";

const mono = "var(--font-ibm-plex-mono), monospace";

interface LinkStudyModalProps {
  worklistItem: WorklistItem;
  onClose: () => void;
  onLinked: (updated: WorklistItem) => void;
}

export function LinkStudyModal({ worklistItem, onClose, onLinked }: LinkStudyModalProps) {
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [studies, setStudies] = useState<PacsStudy[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchStudies();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchStudies = async () => {
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/worklist/${worklistItem.id}/search-studies`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      });
      if (!response.ok) throw new Error("Error buscando estudios");
      const data = await response.json();
      setStudies(data.pacs_studies || []);
      if (data.pacs_studies.length === 0) {
        setError("No se encontraron estudios DICOM asociados a esta prestación");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      toast.error("Error al buscar estudios DICOM");
    } finally {
      setSearching(false);
    }
  };

  const linkStudy = async (studyUid: string) => {
    setLinking(true);
    try {
      const response = await fetch(`/api/v1/worklist/${worklistItem.id}/link-study`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({ study_instance_uid: studyUid }),
      });
      if (!response.ok) throw new Error("Error vinculando estudio");
      const updated = await response.json();
      toast.success("Estudio vinculado exitosamente");
      onLinked(updated);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al vincular estudio");
    } finally {
      setLinking(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d || d.length !== 8) return d;
    return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0a0d14",
          border: "1px solid #1e2535",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "900px",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #1e2535",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#e8edf2", fontFamily: mono }}>
              Vincular Estudio DICOM
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#4a5878", fontFamily: mono }}>
              Prestación: {worklistItem.accession_number} · {worklistItem.patient_name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#4a5878",
              cursor: "pointer",
              padding: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "#8a9ab8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#4a5878";
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {searching ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "40px" }}>
              <Loader2 size={24} style={{ color: "#00d4ff", animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: "13px", color: "#4a5878", fontFamily: mono }}>
                Buscando estudios DICOM en el PACS...
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "20px",
                background: "rgba(255,71,87,0.08)",
                border: "1px solid rgba(255,71,87,0.2)",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "13px", color: "#ff4757", fontFamily: mono, margin: 0 }}>{error}</p>
              <button
                onClick={searchStudies}
                style={{
                  marginTop: "12px",
                  padding: "8px 16px",
                  background: "rgba(0,212,255,0.1)",
                  border: "1px solid rgba(0,212,255,0.3)",
                  borderRadius: "6px",
                  color: "#00d4ff",
                  fontSize: "12px",
                  fontFamily: mono,
                  cursor: "pointer",
                }}
              >
                Buscar nuevamente
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {studies.map((study) => (
                <div
                  key={study.study_instance_uid}
                  style={{
                    background: "#131720",
                    border: "1px solid #1e2535",
                    borderRadius: "8px",
                    padding: "16px",
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e2535")}
                >
                  {/* Modality badge */}
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "8px",
                      background: `rgba(0,212,255,0.1)`,
                      border: `1px solid rgba(0,212,255,0.3)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#00d4ff",
                      fontFamily: mono,
                      flexShrink: 0,
                    }}
                  >
                    {study.modalities || "?"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2", fontFamily: mono }}>
                        {study.patient_name || "Sin nombre"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#4a5878", fontFamily: mono, marginTop: "2px" }}>
                        {study.study_description || "Sin descripción"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "11px", color: "#4a5878", fontFamily: mono }}>
                      <span>📅 {formatDate(study.study_date)}</span>
                      <span>🆔 {study.patient_id}</span>
                      {study.accession_number && <span>📋 {study.accession_number}</span>}
                      <span>📊 {study.num_series} series · {study.num_instances} img</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <a
                      href={study.viewer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.3)",
                        borderRadius: "6px",
                        color: "#a78bfa",
                        fontSize: "11px",
                        fontFamily: mono,
                        fontWeight: 500,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <ExternalLink size={12} />
                      Preview
                    </a>
                    <button
                      onClick={() => linkStudy(study.study_instance_uid)}
                      disabled={linking}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: "rgba(0,212,255,0.1)",
                        border: "1px solid rgba(0,212,255,0.3)",
                        borderRadius: "6px",
                        color: "#00d4ff",
                        fontSize: "11px",
                        fontFamily: mono,
                        fontWeight: 600,
                        cursor: linking ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {linking ? (
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <LinkIcon size={12} />
                      )}
                      Vincular
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
