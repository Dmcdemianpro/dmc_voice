"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { worklistApi, patientsApi, adminApi } from "@/lib/api";
import type { WorklistItem } from "@/types/report.types";
import type { PatientResult } from "@/lib/api";
import type { User } from "@/types/report.types";
import { useAuthStore } from "@/store/authStore";
import { hasPermission, type Role } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import {
  Mic, Search, RefreshCw, Clock, User as UserIcon, Activity, Plus, X,
  Stethoscope, FileText, CheckCircle, AlertCircle,
  ImageIcon, UserCheck, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useMobileCtx } from "../layout";

// ── Constantes ──────────────────────────────────────────────────────────────

const MODALIDADES = ["", "RX", "TC", "RM", "ECO", "PET-CT", "MAMOGRAFIA", "DENSITOMETRIA"];

const REGIONES_CHILE = [
  "Región de Arica y Parinacota", "Región de Tarapacá", "Región de Antofagasta",
  "Región de Atacama", "Región de Coquimbo", "Región de Valparaíso",
  "Región Metropolitana de Santiago", "Región del Libertador Gral. Bernardo O'Higgins",
  "Región del Maule", "Región de Ñuble", "Región del Biobío", "Región de La Araucanía",
  "Región de Los Ríos", "Región de Los Lagos", "Región de Aysén", "Región de Magallanes",
];

const PREVISION_OPTIONS = [
  { value: "FONASA_A", label: "FONASA A" },
  { value: "FONASA_B", label: "FONASA B" },
  { value: "FONASA_C", label: "FONASA C" },
  { value: "FONASA_D", label: "FONASA D" },
  { value: "ISAPRE",   label: "ISAPRE"   },
  { value: "PARTICULAR", label: "Particular" },
  { value: "OTRO",     label: "Otro"     },
];

// Regiones anatómicas agrupadas para radiología e imagenología
const REGIONES_ANATOMICAS: { group: string; items: string[] }[] = [
  {
    group: "Cabeza y Cuello",
    items: [
      "Cráneo", "Silla Turca", "Órbitas", "Nariz y Senos Paranasales",
      "Oído / Peñasco", "Macizo Facial", "Mandíbula", "ATM (Articulación Temporomandibular)",
      "Cuello", "Laringe / Faringe", "Tiroides",
    ],
  },
  {
    group: "Tórax",
    items: [
      "Tórax", "Pulmones", "Corazón", "Mediastino",
      "Costillas", "Esternón", "Clavícula Derecha", "Clavícula Izquierda",
      "Mama Derecha", "Mama Izquierda", "Mama Bilateral",
    ],
  },
  {
    group: "Abdomen y Pelvis",
    items: [
      "Abdomen", "Abdomen Superior", "Abdomen Inferior",
      "Abdomen y Pelvis", "Pelvis",
      "Hígado", "Vesícula y Vías Biliares", "Páncreas", "Bazo",
      "Riñones", "Suprarrenales", "Retroperitoneo",
      "Aparato Urinario", "Vejiga", "Próstata",
      "Útero y Ovarios", "Escroto / Testículos",
    ],
  },
  {
    group: "Columna",
    items: [
      "Columna Cervical", "Columna Dorsal / Torácica", "Columna Lumbar",
      "Columna Lumbosacra", "Columna Completa", "Sacro y Cóccix",
    ],
  },
  {
    group: "Extremidad Superior Derecha",
    items: [
      "Hombro Derecho", "Brazo Derecho", "Codo Derecho",
      "Antebrazo Derecho", "Muñeca Derecha", "Mano Derecha",
      "Dedos Mano Derecha", "Pulgar Derecho",
    ],
  },
  {
    group: "Extremidad Superior Izquierda",
    items: [
      "Hombro Izquierdo", "Brazo Izquierdo", "Codo Izquierdo",
      "Antebrazo Izquierdo", "Muñeca Izquierda", "Mano Izquierda",
      "Dedos Mano Izquierda", "Pulgar Izquierdo",
    ],
  },
  {
    group: "Extremidad Inferior Derecha",
    items: [
      "Cadera Derecha", "Fémur Derecho", "Rodilla Derecha",
      "Pierna Derecha", "Tobillo Derecho", "Pie Derecho",
      "Talón Derecho", "Dedos Pie Derecho",
    ],
  },
  {
    group: "Extremidad Inferior Izquierda",
    items: [
      "Cadera Izquierda", "Fémur Izquierdo", "Rodilla Izquierda",
      "Pierna Izquierda", "Tobillo Izquierdo", "Pie Izquierdo",
      "Talón Izquierdo", "Dedos Pie Izquierdo",
    ],
  },
  {
    group: "Pelvis / Caderas",
    items: ["Pelvis Ósea", "Caderas Bilateral", "Articulaciones Sacroilíacas", "Sínfisis Púbica"],
  },
  {
    group: "Sistema Nervioso",
    items: [
      "Encéfalo", "Cerebelo", "Tronco Encefálico",
      "Médula Espinal", "Plexo Braquial", "Plexo Lumbosacro",
    ],
  },
  {
    group: "Vascular",
    items: [
      "Aorta", "Vasos del Cuello (TSA)", "Vasos Extremidades Superiores",
      "Vasos Extremidades Inferiores", "Vasos Renales", "Vasos Mesentéricos",
      "Vasos Pulmonares", "Venas Profundas (Doppler)",
    ],
  },
  {
    group: "Otros",
    items: [
      "Cuerpo Completo", "Esqueleto Completo", "Tejidos Blandos",
      "Ganglio Centinela", "Partes Blandas Cuello", "Partes Blandas Extremidad",
    ],
  },
];

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  PENDIENTE:  { color: "#ffa502", bg: "rgba(255,165,2,0.08)",  border: "rgba(255,165,2,0.25)"  },
  EN_PROCESO: { color: "#00d4ff", bg: "rgba(0,212,255,0.08)",  border: "rgba(0,212,255,0.25)"  },
  COMPLETADO: { color: "#2ed573", bg: "rgba(46,213,115,0.08)", border: "rgba(46,213,115,0.25)" },
};

const MODAL_COLORS: Record<string, string> = {
  RX: "#00d4ff", TC: "#a78bfa", RM: "#34d399", ECO: "#fb923c",
  "PET-CT": "#f472b6", MAMOGRAFIA: "#fbbf24", DENSITOMETRIA: "#60a5fa",
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  MANUAL: { label: "Manual", color: "#4a5878" },
  HL7:    { label: "HL7",    color: "#a78bfa" },
  FHIR:   { label: "FHIR",   color: "#34d399" },
  API:    { label: "API",    color: "#fb923c" },
};

function generateAccessionNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ACC-${date}-${rand}`;
}

const EMPTY_FORM = {
  // Examen
  accession_number: "", study_id: "", modalidad: "", region: "",
  prestacion: "", scheduled_at: "",
  // Paciente
  patient_name: "", patient_rut: "", patient_dob: "", patient_sex: "",
  patient_phone: "", patient_email: "", patient_address: "",
  patient_commune: "", patient_region: "",
  prevision: "", isapre_nombre: "",
  // Derivación
  medico_derivador: "", servicio_solicitante: "",
};

type Tab = "paciente" | "examen" | "derivacion";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "paciente",   label: "Paciente",   icon: <UserIcon style={{ width: "12px", height: "12px" }} /> },
  { id: "examen",     label: "Examen",     icon: <FileText style={{ width: "12px", height: "12px" }} /> },
  { id: "derivacion", label: "Derivación", icon: <Stethoscope style={{ width: "12px", height: "12px" }} /> },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function WorklistPage() {
  const { user } = useAuthStore();
  const canCreate = hasPermission((user?.role ?? "RADIOLOGO") as Role, "worklist.create");
  const isAdmin = user?.role === "ADMIN" || user?.role === "JEFE_SERVICIO";
  const canToggleImages = isAdmin || user?.role === "TECNOLOGO";
  const { isMobile, toggleMenu } = useMobileCtx();

  const [items, setItems] = useState<WorklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalidad, setModalidad] = useState("");
  const [search, setSearch] = useState("");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("paciente");

  // Assign radiologist state
  const [radiologists, setRadiologists] = useState<User[]>([]);
  const [assignTarget, setAssignTarget] = useState<WorklistItem | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [togglingImages, setTogglingImages] = useState<string | null>(null);

  // Patient search state
  // mode: "search" → solo buscador | "ask_create" → sin resultados, preguntar
  //        "creating" → formulario nuevo paciente | "loaded" → paciente cargado desde BD
  type PatientMode = "search" | "ask_create" | "creating" | "loaded";
  const [patientMode, setPatientMode] = useState<PatientMode>("search");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [loadedPatient, setLoadedPatient] = useState<PatientResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  const f = (key: keyof typeof EMPTY_FORM, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // ── Patient search debounce ────────────────────────────────────────────────
  useEffect(() => {
    if (patientQuery.length < 2) {
      setPatientResults([]);
      setShowResults(false);
      setSearchDone(false);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await patientsApi.search(patientQuery);
        setPatientResults(res.data);
        setSearchDone(true);
        if (res.data.length > 0) {
          setShowResults(true);
          setPatientMode("search");
        } else {
          setShowResults(false);
          setPatientMode("ask_create");
        }
      } catch {
        setPatientResults([]);
        setSearchDone(true);
      } finally {
        setSearching(false);
      }
    }, 380);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [patientQuery]);

  // Close results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadPatient = (p: PatientResult) => {
    setLoadedPatient(p);
    setPatientMode("loaded");
    setShowResults(false);
    setPatientQuery(p.patient_name || p.patient_rut || "");
    setForm(prev => ({
      ...prev,
      patient_name:    p.patient_name    || "",
      patient_rut:     p.patient_rut     || "",
      patient_dob:     p.patient_dob     || "",
      patient_sex:     "",                        // not stored in PatientResult
      patient_phone:   p.patient_phone   || "",
      patient_email:   p.patient_email   || "",
      patient_address: p.patient_address || "",
      patient_commune: p.patient_commune || "",
      patient_region:  p.patient_region  || "",
      prevision:       p.prevision       || "",
      isapre_nombre:   p.isapre_nombre   || "",
    }));
  };

  const clearPatient = () => {
    setLoadedPatient(null);
    setPatientMode("search");
    setPatientQuery("");
    setPatientResults([]);
    setSearchDone(false);
    setShowResults(false);
    setForm(prev => ({
      ...prev,
      patient_name: "", patient_rut: "", patient_dob: "", patient_sex: "",
      patient_phone: "", patient_email: "", patient_address: "",
      patient_commune: "", patient_region: "", prevision: "", isapre_nombre: "",
    }));
  };

  // ── Crear estudio ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const accession = form.accession_number.trim() || generateAccessionNumber();
    setSaving(true);
    try {
      await worklistApi.create({
        accession_number: accession,
        study_id:            form.study_id            || undefined,
        modalidad:           form.modalidad           || undefined,
        region:              form.region              || undefined,
        scheduled_at:        form.scheduled_at        || undefined,
        medico_derivador:    form.medico_derivador    || undefined,
        servicio_solicitante: form.servicio_solicitante || undefined,
        patient_name:        form.patient_name        || undefined,
        patient_rut:         form.patient_rut         || undefined,
        patient_dob:         form.patient_dob         || undefined,
        patient_sex:         form.patient_sex         || undefined,
        patient_phone:       form.patient_phone       || undefined,
        patient_email:       form.patient_email       || undefined,
        patient_address:     form.patient_address     || undefined,
        patient_commune:     form.patient_commune     || undefined,
        patient_region:      form.patient_region      || undefined,
        prevision:           form.prevision           || undefined,
        isapre_nombre:       form.isapre_nombre       || undefined,
      });
      toast.success("Estudio agregado al worklist");
      setShowModal(false);
      resetModal();
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Error al crear el estudio");
    } finally {
      setSaving(false);
    }
  };

  const resetModal = () => {
    setForm(EMPTY_FORM);
    setActiveTab("paciente");
    setLoadedPatient(null);
    setPatientMode("search");
    setPatientQuery("");
    setPatientResults([]);
    setShowResults(false);
    setSearchDone(false);
  };

  const load = () => {
    setLoading(true);
    worklistApi.list("PENDIENTE", modalidad || undefined)
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [modalidad]);

  // Load radiologists for assign modal (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    adminApi.users().then(r => {
      setRadiologists(r.data.filter((u: User) => u.role === "RADIOLOGO" || u.role === "JEFE_SERVICIO"));
    }).catch(() => {});
  }, [isAdmin]);

  const handleAssign = async (userId: string | null) => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const { data } = await worklistApi.assign(assignTarget.id, userId);
      setItems(prev => prev.map(i => i.id === assignTarget.id ? { ...i, assigned_to_id: data.assigned_to_id, assigned_to_name: data.assigned_to_name } : i));
      setAssignTarget(null);
      toast.success(userId ? `Asignado a ${data.assigned_to_name}` : "Asignación removida");
    } catch {
      toast.error("Error al asignar");
    } finally {
      setAssigning(false);
    }
  };

  const handleToggleImages = async (itemId: string) => {
    setTogglingImages(itemId);
    try {
      const { data } = await worklistApi.toggleImages(itemId);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, has_images: data.has_images } : i));
    } catch {
      toast.error("Error al actualizar imágenes");
    } finally {
      setTogglingImages(null);
    }
  };

  const filtered = items.filter((i) =>
    !search || [i.patient_name, i.accession_number, i.region, i.study_id]
      .some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const inp: React.CSSProperties = {
    width: "100%", background: "#0a0d14", border: "1px solid #2a3550",
    borderRadius: "6px", padding: "9px 12px",
    fontSize: "13px", fontFamily: "IBM Plex Mono, monospace", color: "#e8edf2",
    outline: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#8a9ab8",
    textTransform: "uppercase" as const, letterSpacing: "0.06em",
    marginBottom: "6px", display: "block", fontWeight: 600,
  };

  // Navigation helpers
  const TAB_ORDER: Tab[] = ["paciente", "examen", "derivacion"];
  const tabIdx = TAB_ORDER.indexOf(activeTab);
  const goNext = () => tabIdx < TAB_ORDER.length - 1 && setActiveTab(TAB_ORDER[tabIdx + 1]);
  const goPrev = () => tabIdx > 0 && setActiveTab(TAB_ORDER[tabIdx - 1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Worklist" subtitle="Estudios pendientes de informe" isMobile={isMobile} onMenuToggle={toggleMenu} />

      <div style={{ flex: 1, padding: isMobile ? "12px" : "24px", overflowY: "auto" }}>

        {/* Stats + controles */}
        <div style={{ display: "flex", gap: isMobile ? "8px" : "12px", marginBottom: isMobile ? "12px" : "20px", flexWrap: "wrap" }}>
          {[
            { label: "Total pendientes", value: items.length, color: "#00d4ff" },
            { label: "En proceso",       value: items.filter(i => i.status === "EN_PROCESO").length, color: "#ffa502" },
            { label: "Resultados",       value: filtered.length, color: "#2ed573" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#131720", border: "1px solid #1e2535",
              borderRadius: "6px", padding: isMobile ? "8px 12px" : "10px 16px",
              display: "flex", flexDirection: "column", gap: "2px",
              minWidth: isMobile ? "90px" : "120px",
              flex: isMobile ? "1 1 0" : undefined,
            }}>
              <span style={{ fontSize: isMobile ? "9px" : "10px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              <span style={{ fontSize: isMobile ? "16px" : "20px", fontWeight: 700, color, fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.2 }}>{loading ? "—" : value}</span>
            </div>
          ))}
        </div>

        {/* Search + actions row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: isMobile ? "12px" : "20px", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", width: isMobile ? "100%" : "240px", flex: isMobile ? "1 1 100%" : undefined }}>
            <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: "13px", height: "13px", color: "#4a5878", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar paciente, acceso..."
              style={{
                width: "100%", background: "#131720", border: "1px solid #1e2535",
                borderRadius: "6px", paddingLeft: "32px", paddingRight: "12px",
                paddingTop: "8px", paddingBottom: "8px",
                fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", color: "#e8edf2",
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(0,212,255,0.4)")}
              onBlur={e => (e.target.style.borderColor = "#1e2535")}
            />
          </div>

          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value)}
            style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "8px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
              color: "#e8edf2", outline: "none", cursor: "pointer",
              flex: isMobile ? "1 1 0" : undefined,
            }}
          >
            {MODALIDADES.map((m) => (
              <option key={m} value={m} style={{ background: "#131720" }}>
                {m || "Todas"}
              </option>
            ))}
          </select>

          {canCreate && (
            <button
              onClick={() => {
                resetModal();
                setForm(prev => ({ ...prev, accession_number: generateAccessionNumber() }));
                setShowModal(true);
              }}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 14px", background: "rgba(0,212,255,0.1)",
                border: "1px solid rgba(0,212,255,0.35)", borderRadius: "6px",
                color: "#00d4ff", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.18)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.1)"; }}
            >
              <Plus style={{ width: "13px", height: "13px" }} />
              {isMobile ? "Nuevo" : "Nuevo Estudio"}
            </button>
          )}

          <button
            onClick={load}
            style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "8px 10px", color: "#4a5878", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3550"; (e.currentTarget as HTMLButtonElement).style.color = "#8a9ab8"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2535"; (e.currentTarget as HTMLButtonElement).style.color = "#4a5878"; }}
          >
            <RefreshCw style={{ width: "14px", height: "14px", animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>

        {/* Table (desktop) / Cards (mobile) */}
        <div style={{ background: "#131720", border: "1px solid #1e2535", borderRadius: "8px", overflow: "hidden" }}>
          {/* Desktop table header */}
          {!isMobile && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 100px 80px 130px 110px 60px 160px 80px",
              background: "#0f1218", borderBottom: "1px solid #1e2535", padding: "0 4px",
            }}>
              {["N° Acceso", "Paciente", "Modalidad", "Previsión", "Programado", "Estado", "Origen", "Radiólogo", ""].map((col, i) => (
                <div key={i} style={{
                  padding: "11px 12px", fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                  color: "#4a5878", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
                }}>{col}</div>
              ))}
            </div>
          )}

          {loading ? (
            isMobile ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ padding: "14px", borderBottom: "1px solid #1a2030" }}>
                  <div style={{ height: 12, background: "#1a2030", borderRadius: 3, marginBottom: 8, width: "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 10, background: "#1a2030", borderRadius: 3, width: "40%", animation: "pulse 1.5s ease-in-out infinite 0.2s" }} />
                </div>
              ))
            ) : (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "140px 1fr 100px 80px 130px 110px 60px 160px 80px",
                  borderBottom: "1px solid #1a2030", padding: "0 4px",
                }}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <div key={j} style={{ padding: "14px 12px" }}>
                      <div style={{ height: "10px", background: "#1a2030", borderRadius: "3px", animation: "pulse 1.5s ease-in-out infinite", width: j === 1 ? "70%" : "85%" }} />
                    </div>
                  ))}
                </div>
              ))
            )
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Activity style={{ width: "32px", height: "32px", color: "#1e2535", margin: "0 auto 12px" }} />
              <div style={{ color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px" }}>
                No hay estudios pendientes
              </div>
              <div style={{ color: "#2a3550", fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", marginTop: "4px" }}>
                {search ? "Intenta con otro término" : "El worklist está vacío"}
              </div>
            </div>
          ) : isMobile ? (
            /* ── Mobile card view ── */
            filtered.map((item) => {
              const st = STATUS_STYLE[item.status] || { color: "#4a5878", bg: "transparent", border: "#1e2535" };
              const mc = MODAL_COLORS[item.modalidad || ""] || "#4a5878";
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #1a2030",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  {/* Row 1: patient + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <UserIcon style={{ width: 12, height: 12, color: "#00d4ff" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#e8edf2", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.patient_name || "Sin nombre"}
                      </div>
                      {item.patient_rut && (
                        <div style={{ fontSize: 10, color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>{item.patient_rut}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                      borderRadius: 4, padding: "2px 7px", flexShrink: 0,
                    }}>
                      {item.status}
                    </span>
                  </div>

                  {/* Row 2: meta badges */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{
                      fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      color: mc, background: `${mc}18`, border: `1px solid ${mc}35`,
                      borderRadius: 4, padding: "1px 6px",
                    }}>
                      {item.modalidad || "—"}
                    </span>
                    {item.accession_number && (
                      <span style={{ fontSize: 10, color: "#00d4ff", fontFamily: "IBM Plex Mono, monospace" }}>
                        #{item.accession_number}
                      </span>
                    )}
                    {item.scheduled_at && (
                      <span style={{ fontSize: 10, color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock style={{ width: 9, height: 9 }} />
                        {formatDate(item.scheduled_at)}
                      </span>
                    )}
                    {item.has_images && <ImageIcon style={{ width: 10, height: 10, color: "#10b981" }} />}
                  </div>

                  {/* Row 3: actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {item.assigned_to_name && (
                      <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: "IBM Plex Mono, monospace", display: "flex", alignItems: "center", gap: 3, marginRight: "auto" }}>
                        <UserCheck style={{ width: 9, height: 9 }} />
                        {item.assigned_to_name}
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setAssignTarget(item)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 8px", background: "rgba(245,158,11,0.08)",
                          border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4,
                          color: "#f59e0b", fontSize: 10, fontFamily: "IBM Plex Mono, monospace",
                          cursor: "pointer",
                        }}
                      >
                        <UserCheck style={{ width: 9, height: 9 }} /> Asignar
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const studyId = item.study_id || item.id;
                        const qs = new URLSearchParams();
                        if (item.accession_number) qs.set("accession", item.accession_number);
                        if (item.patient_name) qs.set("patient", item.patient_name);
                        if (item.modalidad) qs.set("modalidad", item.modalidad);
                        if (item.region) qs.set("region", item.region);
                        const params = qs.toString() ? `?${qs.toString()}` : "";
                        router.push(`/dictation/${studyId}${params}`);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "5px 10px", background: "rgba(0,212,255,0.12)",
                        border: "1px solid rgba(0,212,255,0.35)", borderRadius: 5,
                        color: "#00d4ff", fontSize: 11, fontFamily: "IBM Plex Mono, monospace",
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      <Mic style={{ width: 11, height: 11 }} /> Dictar
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            /* ── Desktop table rows ── */
            filtered.map((item) => {
            const isHovered = hoveredRow === item.id;
            const st = STATUS_STYLE[item.status] || { color: "#4a5878", bg: "transparent", border: "#1e2535" };
            const mc = MODAL_COLORS[item.modalidad || ""] || "#4a5878";
            const sb = SOURCE_BADGE[item.source || "MANUAL"] || SOURCE_BADGE.MANUAL;
            const prevLabel = PREVISION_OPTIONS.find(p => p.value === item.prevision)?.label;
            return (
              <div
                key={item.id}
                style={{
                  display: "grid", gridTemplateColumns: "140px 1fr 100px 80px 130px 110px 60px 160px 80px",
                  borderBottom: "1px solid #1a2030", padding: "0 4px",
                  background: isHovered ? "#1a2030" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHoveredRow(item.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div style={{ padding: "13px 12px", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "#00d4ff" }}>
                  {item.accession_number || "—"}
                </div>
                <div style={{ padding: "13px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%",
                    background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <UserIcon style={{ width: "12px", height: "12px", color: "#00d4ff" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#e8edf2", fontWeight: 500 }}>{item.patient_name || "—"}</div>
                    {item.patient_rut && (
                      <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>{item.patient_rut}</div>
                    )}
                  </div>
                </div>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                    color: mc, background: `${mc}18`, border: `1px solid ${mc}35`,
                    borderRadius: "4px", padding: "2px 7px",
                  }}>
                    {item.modalidad || "—"}
                  </span>
                  {canToggleImages ? (
                    <button
                      onClick={e => { e.stopPropagation(); handleToggleImages(item.id); }}
                      disabled={togglingImages === item.id}
                      title={item.has_images ? "Con imágenes — clic para desmarcar" : "Sin imágenes — clic para marcar"}
                      style={{
                        background: item.has_images ? "rgba(16,185,129,0.12)" : "transparent",
                        border: `1px solid ${item.has_images ? "rgba(16,185,129,0.35)" : "#2a3550"}`,
                        borderRadius: 4, padding: "2px 5px", cursor: "pointer",
                        display: "flex", alignItems: "center",
                        color: item.has_images ? "#10b981" : "#3a4a68",
                        transition: "all 0.15s",
                      }}
                    >
                      {togglingImages === item.id
                        ? <Loader2 style={{ width: 9, height: 9, animation: "wSpin 0.7s linear infinite" }} />
                        : <ImageIcon style={{ width: 9, height: 9 }} />
                      }
                    </button>
                  ) : item.has_images ? (
                    <ImageIcon style={{ width: 10, height: 10, color: "#10b981" }} />
                  ) : null}
                </div>
                <div style={{ padding: "13px 12px", fontSize: "11px", color: "#8a9ab8", fontFamily: "IBM Plex Mono, monospace" }}>
                  {prevLabel || "—"}
                </div>
                <div style={{ padding: "13px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock style={{ width: "11px", height: "11px", color: "#4a5878", flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878" }}>
                    {item.scheduled_at ? formatDate(item.scheduled_at) : "—"}
                  </span>
                </div>
                <div style={{ padding: "13px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                    color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                    borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.04em",
                  }}>
                    {item.status}
                  </span>
                </div>
                <div style={{ padding: "13px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: sb.color, letterSpacing: "0.04em" }}>
                    {sb.label}
                  </span>
                </div>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                  {item.assigned_to_name ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <UserCheck style={{ width: 10, height: 10, color: "#f59e0b", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: "#e8edf2", fontFamily: "IBM Plex Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
                        {item.assigned_to_name}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); setAssignTarget(item); }}
                          title="Reasignar"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", color: "#4a5878", fontSize: 9, fontFamily: "IBM Plex Mono, monospace" }}
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  ) : isAdmin ? (
                    <button
                      onClick={e => { e.stopPropagation(); setAssignTarget(item); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 8px",
                        background: isHovered ? "rgba(245,158,11,0.08)" : "transparent",
                        border: isHovered ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
                        borderRadius: 4, cursor: "pointer",
                        color: isHovered ? "#f59e0b" : "#3a4a68",
                        fontSize: 10, fontFamily: "IBM Plex Mono, monospace",
                        transition: "all 0.15s", whiteSpace: "nowrap",
                      }}
                    >
                      <UserCheck style={{ width: 9, height: 9 }} /> Asignar
                    </button>
                  ) : (
                    <span style={{ fontSize: 10, color: "#3a4a68", fontFamily: "IBM Plex Mono, monospace" }}>—</span>
                  )}
                </div>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                  <button
                    onClick={() => {
                      const studyId = item.study_id || item.id;
                      const qs = new URLSearchParams();
                      if (item.accession_number) qs.set("accession", item.accession_number);
                      if (item.patient_name) qs.set("patient", item.patient_name);
                      if (item.modalidad) qs.set("modalidad", item.modalidad);
                      if (item.region) qs.set("region", item.region);
                      const params = qs.toString() ? `?${qs.toString()}` : "";
                      router.push(`/dictation/${studyId}${params}`);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "5px 10px",
                      background: isHovered ? "rgba(0,212,255,0.12)" : "transparent",
                      border: isHovered ? "1px solid rgba(0,212,255,0.35)" : "1px solid transparent",
                      borderRadius: "5px", color: isHovered ? "#00d4ff" : "transparent",
                      fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                  >
                    <Mic style={{ width: "11px", height: "11px" }} />
                    Dictar
                  </button>
                </div>
              </div>
            );
          }))}
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: "12px", textAlign: "right", fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
            {filtered.length} {filtered.length === 1 ? "estudio" : "estudios"}
            {search && ` · filtrado de ${items.length} total`}
          </div>
        )}
      </div>

      {/* ── Modal: Nuevo Estudio ── */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetModal(); } }}
        >
          <div style={{
            background: "#131720", border: "1px solid #2a3550", borderRadius: "10px",
            width: "100%", maxWidth: "600px", overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", maxHeight: "92vh",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid #1e2535", background: "#0f1218", flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2" }}>Nuevo Estudio</div>
                <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "2px" }}>
                  Ingresa los datos del paciente y del examen
                </div>
              </div>
              <button
                onClick={() => { setShowModal(false); resetModal(); }}
                style={{ background: "none", border: "none", color: "#4a5878", cursor: "pointer", padding: "4px" }}
              >
                <X style={{ width: "16px", height: "16px" }} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #1e2535", background: "#0f1218", flexShrink: 0 }}>
              {TABS.map((tab, idx) => {
                const isActive = activeTab === tab.id;
                const isDone = TAB_ORDER.indexOf(tab.id) < TAB_ORDER.indexOf(activeTab);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      padding: "10px 0", background: "none",
                      border: "none", borderBottom: isActive ? "2px solid #00d4ff" : "2px solid transparent",
                      color: isActive ? "#00d4ff" : isDone ? "#2ed573" : "#4a5878",
                      fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer",
                      transition: "all 0.15s", marginBottom: "-1px",
                    }}
                  >
                    {isDone ? <CheckCircle style={{ width: "12px", height: "12px" }} /> : tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", flex: 1 }}>

              {/* ── Tab: Paciente ── */}
              {activeTab === "paciente" && (<>

                {/* ── MODO: search — solo buscador ── */}
                {(patientMode === "search" || patientMode === "ask_create") && (
                  <div style={{
                    padding: "16px", background: "rgba(0,212,255,0.04)",
                    border: "1px solid rgba(0,212,255,0.15)", borderRadius: "8px",
                  }}>
                    <div style={{ fontSize: "11px", color: "#00d4ff", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Search style={{ width: "11px", height: "11px" }} />
                      Buscar paciente existente
                    </div>

                    <div ref={searchRef} style={{ position: "relative" }}>
                      <div style={{ position: "relative" }}>
                        <Search style={{
                          position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                          width: "13px", height: "13px", color: "#4a5878", pointerEvents: "none",
                        }} />
                        {searching && (
                          <RefreshCw style={{
                            position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                            width: "12px", height: "12px", color: "#4a5878",
                            animation: "spin 1s linear infinite", pointerEvents: "none",
                          }} />
                        )}
                        <input
                          autoFocus
                          value={patientQuery}
                          onChange={e => { setPatientQuery(e.target.value); if (patientMode === "ask_create") setPatientMode("search"); }}
                          onFocus={() => patientResults.length > 0 && setShowResults(true)}
                          placeholder="Buscar por nombre o RUT..."
                          style={{
                            ...inp, paddingLeft: "34px",
                            borderColor: showResults ? "rgba(0,212,255,0.4)" : "#2a3550",
                          }}
                        />
                      </div>

                      {/* Dropdown de resultados */}
                      {showResults && patientResults.length > 0 && (
                        <div style={{
                          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                          background: "#0f1218", border: "1px solid #2a3550", borderRadius: "6px",
                          zIndex: 100, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        }}>
                          {patientResults.map((p, i) => (
                            <button
                              key={i}
                              onClick={() => loadPatient(p)}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                                padding: "10px 14px", background: "none", border: "none",
                                borderBottom: i < patientResults.length - 1 ? "1px solid #1e2535" : "none",
                                cursor: "pointer", textAlign: "left", transition: "background 0.1s",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#131720")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}
                            >
                              <div style={{
                                width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                                background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                <UserIcon style={{ width: "13px", height: "13px", color: "#00d4ff" }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "12px", color: "#e8edf2", fontWeight: 500 }}>
                                  {p.patient_name || "Sin nombre"}
                                </div>
                                <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "1px" }}>
                                  {[p.patient_rut, p.prevision].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              <span style={{
                                fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                                color: "#00d4ff", background: "rgba(0,212,255,0.1)",
                                padding: "2px 8px", borderRadius: "4px", flexShrink: 0,
                              }}>
                                Cargar
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── MODO: ask_create — paciente no encontrado ── */}
                {patientMode === "ask_create" && searchDone && (
                  <div style={{
                    padding: "20px 16px",
                    background: "rgba(255,165,2,0.05)",
                    border: "1px solid rgba(255,165,2,0.2)",
                    borderRadius: "8px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
                    textAlign: "center",
                  }}>
                    <div style={{
                      width: "44px", height: "44px", borderRadius: "50%",
                      background: "rgba(255,165,2,0.1)", border: "1px solid rgba(255,165,2,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <AlertCircle style={{ width: "20px", height: "20px", color: "#ffa502" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", color: "#e8edf2", fontWeight: 600, marginBottom: "4px" }}>
                        Paciente no encontrado
                      </div>
                      <div style={{ fontSize: "12px", color: "#8a9ab8", lineHeight: 1.5 }}>
                        No existe ningún paciente con <span style={{ color: "#e8edf2", fontFamily: "IBM Plex Mono, monospace" }}>&ldquo;{patientQuery}&rdquo;</span> en el sistema.
                      </div>
                      <div style={{ fontSize: "11px", color: "#4a5878", marginTop: "4px", fontFamily: "IBM Plex Mono, monospace" }}>
                        ¿Deseas registrar un nuevo paciente?
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={clearPatient}
                        style={{
                          padding: "8px 16px", background: "transparent",
                          border: "1px solid #2a3550", borderRadius: "6px",
                          color: "#8a9ab8", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                          cursor: "pointer",
                        }}
                      >
                        Buscar de nuevo
                      </button>
                      <button
                        onClick={() => {
                          setPatientMode("creating");
                          // pre-rellenar nombre/RUT si parece un RUT
                          const q = patientQuery.trim();
                          const looksLikeRut = /^\d[\d.-]*-[\dkK]$/.test(q);
                          setForm(prev => ({
                            ...prev,
                            patient_rut:  looksLikeRut ? q : prev.patient_rut,
                            patient_name: !looksLikeRut ? q : prev.patient_name,
                          }));
                        }}
                        style={{
                          padding: "8px 20px",
                          background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.35)",
                          borderRadius: "6px", color: "#00d4ff", fontSize: "12px",
                          fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        <Plus style={{ width: "12px", height: "12px" }} />
                        Sí, crear nuevo paciente
                      </button>
                    </div>
                  </div>
                )}

                {/* ── MODO: loaded — paciente cargado ── */}
                {patientMode === "loaded" && loadedPatient && (<>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: "rgba(46,213,115,0.06)",
                    border: "1px solid rgba(46,213,115,0.25)", borderRadius: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                        background: "rgba(46,213,115,0.12)", border: "1px solid rgba(46,213,115,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <CheckCircle style={{ width: "16px", height: "16px", color: "#2ed573" }} />
                      </div>
                      <div>
                        <div style={{ color: "#2ed573", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Paciente cargado desde el sistema
                        </div>
                        <div style={{ fontSize: "13px", color: "#e8edf2", fontWeight: 600, marginTop: "2px" }}>
                          {loadedPatient.patient_name || "—"}
                        </div>
                        {loadedPatient.patient_rut && (
                          <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
                            RUT {loadedPatient.patient_rut}
                            {loadedPatient.prevision && ` · ${loadedPatient.prevision.replace("_", " ")}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={clearPatient}
                      style={{
                        background: "none", border: "1px solid rgba(255,82,82,0.25)",
                        borderRadius: "5px", color: "#ff6b6b", fontSize: "10px",
                        fontFamily: "IBM Plex Mono, monospace", cursor: "pointer",
                        padding: "5px 10px", fontWeight: 600, letterSpacing: "0.04em",
                      }}
                    >
                      Cambiar
                    </button>
                  </div>

                  {/* Divider datos editables */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ flex: 1, height: "1px", background: "#1e2535" }} />
                    <span style={{ fontSize: "10px", color: "#2a3550", fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.08em" }}>
                      DATOS DEL PACIENTE · EDITAR SI ES NECESARIO
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "#1e2535" }} />
                  </div>

                  <PatientForm form={form} f={f as (k: string, v: string) => void} inp={inp} lbl={lbl} />
                </>)}

                {/* ── MODO: creating — formulario nuevo paciente ── */}
                {patientMode === "creating" && (<>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "rgba(0,212,255,0.06)",
                    border: "1px solid rgba(0,212,255,0.2)", borderRadius: "6px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Plus style={{ width: "13px", height: "13px", color: "#00d4ff" }} />
                      <span style={{ fontSize: "11px", color: "#00d4ff", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.06em" }}>
                        NUEVO PACIENTE
                      </span>
                    </div>
                    <button
                      onClick={clearPatient}
                      style={{
                        background: "none", border: "none", color: "#4a5878",
                        cursor: "pointer", fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                        display: "flex", alignItems: "center", gap: "4px",
                      }}
                    >
                      <X style={{ width: "11px", height: "11px" }} /> Cancelar
                    </button>
                  </div>

                  <PatientForm form={form} f={f as (k: string, v: string) => void} inp={inp} lbl={lbl} />
                </>)}

              </>)}

              {/* ── Tab: Examen ── */}
              {activeTab === "examen" && (<>

                {/* N° Acceso */}
                <div>
                  <label style={lbl}>
                    N° Acceso
                    <span style={{ color: "#2ed573", marginLeft: "8px", fontSize: "10px", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· auto-generado</span>
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      style={{ ...inp, flex: 1, color: "#00d4ff", letterSpacing: "0.05em" }}
                      value={form.accession_number}
                      readOnly
                    />
                    <button
                      onClick={() => f("accession_number", generateAccessionNumber())}
                      title="Regenerar"
                      style={{
                        background: "#0a0d14", border: "1px solid #2a3550", borderRadius: "6px",
                        padding: "9px 10px", cursor: "pointer", color: "#4a5878",
                        display: "flex", alignItems: "center", flexShrink: 0, transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.color = "#00d4ff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3550"; (e.currentTarget as HTMLButtonElement).style.color = "#4a5878"; }}
                    >
                      <RefreshCw style={{ width: "12px", height: "12px" }} />
                    </button>
                  </div>
                </div>

                {/* Modalidad */}
                <div>
                  <label style={lbl}>Modalidad</label>
                  <select style={{ ...inp, cursor: "pointer" }} value={form.modalidad} onChange={e => f("modalidad", e.target.value)}>
                    <option value="">— Seleccionar modalidad —</option>
                    {["RX", "TC", "RM", "ECO", "PET-CT", "MAMOGRAFIA", "DENSITOMETRIA"].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Región anatómica — dropdown agrupado */}
                <div>
                  <label style={lbl}>Región anatómica</label>
                  <select
                    style={{ ...inp, cursor: "pointer" }}
                    value={form.region}
                    onChange={e => f("region", e.target.value)}
                  >
                    <option value="">— Seleccionar región —</option>
                    {REGIONES_ANATOMICAS.map(group => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map(item => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Prestación */}
                <div>
                  <label style={lbl}>
                    Prestación
                    <span style={{ color: "#4a5878", marginLeft: "8px", fontSize: "10px", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· código / descripción</span>
                  </label>
                  <input
                    style={inp}
                    placeholder="Ej: 0301011 — Rx Tórax AP y Lateral"
                    value={form.prestacion}
                    onChange={e => f("prestacion", e.target.value)}
                  />
                </div>

                {/* Fecha + ID externo */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={lbl}>Fecha programada</label>
                    <input
                      style={{ ...inp, colorScheme: "dark" }}
                      type="datetime-local"
                      value={form.scheduled_at}
                      onChange={e => f("scheduled_at", e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={lbl}>ID Estudio (externo)</label>
                    <input style={inp} placeholder="ID del RIS/HIS" value={form.study_id} onChange={e => f("study_id", e.target.value)} />
                  </div>
                </div>
              </>)}

              {/* ── Tab: Derivación ── */}
              {activeTab === "derivacion" && (<>
                <div>
                  <label style={lbl}>Médico derivador</label>
                  <input style={inp} placeholder="Nombre del médico que solicita el examen" value={form.medico_derivador} onChange={e => f("medico_derivador", e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Servicio solicitante</label>
                  <input style={inp} placeholder="Ej: Urgencias, Medicina Interna, Oncología…" value={form.servicio_solicitante} onChange={e => f("servicio_solicitante", e.target.value)} />
                </div>

                {/* Info integración */}
                <div style={{
                  marginTop: "8px", padding: "14px 16px",
                  background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)",
                  borderRadius: "8px",
                }}>
                  <div style={{ fontSize: "11px", color: "#a78bfa", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, marginBottom: "6px" }}>
                    Integración externa (RIS/HIS)
                  </div>
                  <div style={{ fontSize: "11px", color: "#8a9ab8", lineHeight: 1.6 }}>
                    Sistemas externos pueden enviar pacientes automáticamente via:
                  </div>
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {[
                      ["POST",   "/api/v1/worklist/integration",   "JSON con demografía + estudio"],
                      ["Header", "X-Integration-Token",            "Token configurado en INTEGRATION_TOKEN"],
                      ["Source", "HL7 | FHIR | API",               "Campo source para trazabilidad"],
                    ].map(([method, path, desc]) => (
                      <div key={path} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: "#00d4ff", background: "rgba(0,212,255,0.1)", padding: "1px 6px", borderRadius: "3px", flexShrink: 0 }}>{method}</span>
                        <span style={{ fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878" }}>{path} — {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}
            </div>

            {/* Footer */}
            <div style={{
              padding: "14px 20px", borderTop: "1px solid #1e2535",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#0f1218", flexShrink: 0,
            }}>
              {/* Progress dots */}
              <div style={{ display: "flex", gap: "6px" }}>
                {TABS.map((tab) => {
                  const idx = TAB_ORDER.indexOf(tab.id);
                  const current = TAB_ORDER.indexOf(activeTab);
                  return (
                    <div
                      key={tab.id}
                      style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: idx === current ? "#00d4ff" : idx < current ? "#2ed573" : "#2a3550",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                {tabIdx > 0 && (
                  <button
                    onClick={goPrev}
                    style={{
                      padding: "8px 16px", background: "transparent", border: "1px solid #2a3550",
                      borderRadius: "6px", color: "#8a9ab8", fontSize: "12px",
                      fontFamily: "IBM Plex Mono, monospace", cursor: "pointer",
                    }}
                  >
                    ← Anterior
                  </button>
                )}
                {activeTab !== "derivacion" ? (
                  <button
                    onClick={goNext}
                    style={{
                      padding: "8px 20px", background: "rgba(0,212,255,0.1)",
                      border: "1px solid rgba(0,212,255,0.35)", borderRadius: "6px",
                      color: "#00d4ff", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Siguiente →
                  </button>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    style={{
                      padding: "8px 20px",
                      background: saving ? "rgba(46,213,115,0.05)" : "rgba(46,213,115,0.12)",
                      border: "1px solid rgba(46,213,115,0.35)", borderRadius: "6px",
                      color: "#2ed573", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                      fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}
                  >
                    {saving ? (
                      <><RefreshCw style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} /> Guardando...</>
                    ) : (
                      <><Plus style={{ width: "12px", height: "12px" }} /> Crear Estudio</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Asignar Radiólogo ── */}
      {assignTarget && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => !assigning && setAssignTarget(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#131720", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 10, padding: 20, width: 340,
              fontFamily: "IBM Plex Mono, monospace",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <UserCheck style={{ width: 13, height: 13, color: "#f59e0b" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#b0bfd4", textTransform: "uppercase" as const, letterSpacing: "0.15em" }}>
                Asignar Radiólogo
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: "#4a5878", marginBottom: 12 }}>
              {assignTarget.patient_name || assignTarget.accession_number} · {assignTarget.modalidad || "—"}
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, maxHeight: 280, overflowY: "auto" as const }}>
              {/* Desasignar option */}
              {assignTarget.assigned_to_id && (
                <button
                  disabled={assigning}
                  onClick={() => handleAssign(null)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.22)",
                    borderRadius: 6, cursor: assigning ? "not-allowed" : "pointer",
                    color: "#ff4757", fontSize: 11, opacity: assigning ? 0.6 : 1,
                  }}
                >
                  <span>Sin asignar</span>
                  <X style={{ width: 10, height: 10 }} />
                </button>
              )}
              {radiologists.length === 0 ? (
                <div style={{ fontSize: 11, color: "#4a5878", padding: "12px 0" }}>Sin radiólogos disponibles</div>
              ) : radiologists.map(r => (
                <button
                  key={r.id}
                  disabled={assigning}
                  onClick={() => handleAssign(r.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px",
                    background: assignTarget.assigned_to_id === r.id ? "rgba(245,158,11,0.1)" : "#1a2030",
                    border: `1px solid ${assignTarget.assigned_to_id === r.id ? "rgba(245,158,11,0.4)" : "#2a3550"}`,
                    borderRadius: 6, cursor: assigning ? "not-allowed" : "pointer",
                    color: "#e8edf2", fontSize: 11,
                    transition: "all 0.15s", opacity: assigning ? 0.6 : 1,
                  }}
                >
                  <span>{r.full_name}</span>
                  <span style={{ fontSize: 9, color: "#4a5878", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{r.role}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setAssignTarget(null)}
              disabled={assigning}
              style={{
                marginTop: 14, width: "100%", padding: "7px 0",
                background: "none", border: "1px solid #2a3550",
                borderRadius: 6, cursor: assigning ? "not-allowed" : "pointer",
                color: "#4a5878", fontSize: 10, fontFamily: "IBM Plex Mono, monospace",
                opacity: assigning ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes wSpin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input::placeholder  { color: rgba(138,154,184,0.45) !important; }
        select option        { background: #0f1218 !important; color: #e8edf2 !important; }
        optgroup             { background: #0a0d14 !important; color: #4a5878 !important; font-size: 10px; }
      `}</style>
    </div>
  );
}

// ── Formulario de datos de paciente (reutilizado en modo loaded y creating) ──

function PatientForm({
  form, f, inp, lbl,
}: {
  form: Record<string, string>;
  f: (key: string, val: string) => void;
  inp: React.CSSProperties;
  lbl: React.CSSProperties;
}) {
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div>
        <label style={lbl}>Nombre completo</label>
        <input style={inp} placeholder="Nombre y apellidos" value={form.patient_name}
          onChange={e => f("patient_name", e.target.value)} />
      </div>
      <div>
        <label style={lbl}>RUT</label>
        <input style={inp} placeholder="12.345.678-9" value={form.patient_rut}
          onChange={e => f("patient_rut", e.target.value)} />
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: "12px" }}>
      <div>
        <label style={lbl}>Fecha de nacimiento</label>
        <input style={{ ...inp, colorScheme: "dark" }} type="date" value={form.patient_dob}
          onChange={e => f("patient_dob", e.target.value)} />
      </div>
      <div>
        <label style={lbl}>Sexo</label>
        <select style={{ ...inp, cursor: "pointer" }} value={form.patient_sex}
          onChange={e => f("patient_sex", e.target.value)}>
          <option value="">—</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
          <option value="I">Indeterminado</option>
        </select>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div>
        <label style={lbl}>Teléfono</label>
        <input style={inp} placeholder="+56 9 XXXX XXXX" value={form.patient_phone}
          onChange={e => f("patient_phone", e.target.value)} />
      </div>
      <div>
        <label style={lbl}>Email</label>
        <input style={inp} type="email" placeholder="paciente@correo.cl" value={form.patient_email}
          onChange={e => f("patient_email", e.target.value)} />
      </div>
    </div>

    <div>
      <label style={lbl}>Dirección</label>
      <input style={inp} placeholder="Calle 123, Depto 4B" value={form.patient_address}
        onChange={e => f("patient_address", e.target.value)} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div>
        <label style={lbl}>Comuna</label>
        <input style={inp} placeholder="Ej: Providencia" value={form.patient_commune}
          onChange={e => f("patient_commune", e.target.value)} />
      </div>
      <div>
        <label style={lbl}>Región</label>
        <select style={{ ...inp, cursor: "pointer" }} value={form.patient_region}
          onChange={e => f("patient_region", e.target.value)}>
          <option value="">— Seleccionar —</option>
          {REGIONES_CHILE.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: form.prevision === "ISAPRE" ? "1fr 1fr" : "1fr", gap: "12px" }}>
      <div>
        <label style={lbl}>Previsión</label>
        <select style={{ ...inp, cursor: "pointer" }} value={form.prevision}
          onChange={e => f("prevision", e.target.value)}>
          <option value="">— Seleccionar —</option>
          {PREVISION_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      {form.prevision === "ISAPRE" && (
        <div>
          <label style={lbl}>Nombre ISAPRE</label>
          <input style={inp} placeholder="Ej: Banmédica, Colmena…" value={form.isapre_nombre}
            onChange={e => f("isapre_nombre", e.target.value)} />
        </div>
      )}
    </div>
  </>);
}
