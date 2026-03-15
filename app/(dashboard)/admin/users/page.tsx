"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import type { User } from "@/types/report.types";
import { formatDate } from "@/lib/utils";
import {
  UserCheck, UserX, RefreshCw, Users, ShieldCheck, Activity,
  UserPlus, X, Plus, Pencil, Trash2, AlertTriangle, Eye, EyeOff, Save,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";

// ── Constantes ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  ADMIN:         { color: "#ff4757", bg: "rgba(255,71,87,0.1)",   border: "rgba(255,71,87,0.3)",   label: "Admin"         },
  JEFE_SERVICIO: { color: "#ffa502", bg: "rgba(255,165,2,0.08)",  border: "rgba(255,165,2,0.25)",  label: "Jefe Servicio" },
  RADIOLOGO:     { color: "#00d4ff", bg: "rgba(0,212,255,0.08)",  border: "rgba(0,212,255,0.25)",  label: "Radiólogo"     },
  TECNOLOGO:     { color: "#2ed573", bg: "rgba(46,213,115,0.08)", border: "rgba(46,213,115,0.25)", label: "Tecnólogo"     },
};

const EMPTY_CREATE = { rut: "", email: "", full_name: "", role: "RADIOLOGO", password: "", institution: "" };
const EMPTY_EDIT   = { full_name: "", email: "", role: "RADIOLOGO", institution: "", new_password: "" };

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Avatar({ name, color }: { name: string; color: string }) {
  const letter = (name || "?")[0].toUpperCase();
  return (
    <div style={{
      width: "30px", height: "30px", borderRadius: "50%",
      background: `${color}18`, border: `1px solid ${color}30`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontSize: "12px", fontWeight: 700, color, fontFamily: "IBM Plex Mono, monospace",
    }}>
      {letter}
    </div>
  );
}

function ModalInput({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  const lbl: React.CSSProperties = {
    fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#8a9ab8",
    textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: "6px", display: "block", fontWeight: 600,
  };
  return (
    <div>
      <label style={lbl}>
        {label}
        {required && <span style={{ color: "#ff4757", marginLeft: "4px" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editForm,   setEditForm]   = useState(EMPTY_EDIT);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // States
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showPass,   setShowPass]   = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Filter
  const [roleFilter,   setRoleFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search,       setSearch]       = useState("");

  const inp: React.CSSProperties = {
    width: "100%", background: "#0a0d14", border: "1px solid #2a3550",
    borderRadius: "6px", padding: "9px 12px",
    fontSize: "13px", fontFamily: "IBM Plex Mono, monospace", color: "#e8edf2",
    outline: "none", boxSizing: "border-box",
  };

  // ── Cargar ─────────────────────────────────────────────────────────────────
  const load = () => {
    setLoading(true);
    adminApi.users().then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (roleFilter   && u.role !== roleFilter) return false;
    if (statusFilter === "active"   && !u.is_active) return false;
    if (statusFilter === "inactive" &&  u.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![u.full_name, u.email, u.rut, u.institution].some(v => v?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ── Crear usuario ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.rut || !createForm.email || !createForm.full_name || !createForm.password) {
      toast.error("Completa todos los campos obligatorios"); return;
    }
    setSaving(true);
    try {
      await adminApi.createUser({
        rut: createForm.rut, email: createForm.email, full_name: createForm.full_name,
        role: createForm.role, password: createForm.password,
        institution: createForm.institution || undefined,
      });
      toast.success(`Usuario ${createForm.full_name} creado`);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  };

  // ── Abrir edición ──────────────────────────────────────────────────────────
  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({
      full_name:    u.full_name,
      email:        u.email,
      role:         u.role,
      institution:  u.institution || "",
      new_password: "",
    });
    setShowEdit(true);
    setShowNewPass(false);
  };

  // ── Guardar edición ────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: Partial<User> & { password?: string } = {
        full_name:   editForm.full_name,
        email:       editForm.email,
        role:        editForm.role as User["role"],
        institution: editForm.institution || undefined,
      };
      if (editForm.new_password.trim()) {
        // send as password field if backend supports it
        (payload as Record<string, unknown>).password = editForm.new_password.trim();
      }
      await adminApi.updateUser(editTarget.id, payload);
      toast.success(`Usuario ${editForm.full_name} actualizado`);
      setShowEdit(false);
      setEditTarget(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Error al actualizar usuario");
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle activo ──────────────────────────────────────────────────────────
  const toggleUser = async (u: User) => {
    setTogglingId(u.id);
    try {
      await adminApi.updateUser(u.id, { is_active: !u.is_active });
      toast.success(`Usuario ${u.is_active ? "desactivado" : "activado"}`);
      load();
    } catch {
      toast.error("Error al actualizar usuario");
    } finally {
      setTogglingId(null);
    }
  };

  // ── Eliminar usuario ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deactivateUser(deleteTarget.id);
      toast.success(`Usuario ${deleteTarget.full_name} eliminado`);
      setShowDelete(false);
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Error al eliminar usuario");
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = users.filter(u => u.is_active).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title="Gestión de Usuarios" subtitle={`${users.length} usuarios registrados`} />

      <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>

        {/* Stats */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
          {[
            { icon: Users,       label: "Total",     value: users.length,            color: "#00d4ff" },
            { icon: Activity,    label: "Activos",   value: activeCount,             color: "#2ed573" },
            { icon: ShieldCheck, label: "Inactivos", value: users.length - activeCount, color: "#4a5878" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "10px 16px", display: "flex", alignItems: "center", gap: "12px", minWidth: "130px",
            }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "6px",
                background: `${color}12`, border: `1px solid ${color}20`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Icon style={{ width: "14px", height: "14px", color }} />
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color, fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.2 }}>{loading ? "—" : value}</div>
              </div>
            </div>
          ))}

          <div style={{ flex: 1 }} />

          {/* Filtros */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "8px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
              color: "#e8edf2", outline: "none", cursor: "pointer",
            }}
          >
            <option value="">Todos los roles</option>
            {Object.entries(ROLE_CONFIG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "8px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
              color: "#e8edf2", outline: "none", cursor: "pointer",
            }}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>

          <div style={{ position: "relative" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuario..."
              style={{
                background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
                padding: "8px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                color: "#e8edf2", outline: "none", width: "200px",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(0,212,255,0.4)")}
              onBlur={e => (e.target.style.borderColor = "#1e2535")}
            />
          </div>

          <button
            onClick={() => { setCreateForm(EMPTY_CREATE); setShowPass(false); setShowCreate(true); }}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", background: "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.35)", borderRadius: "6px",
              color: "#00d4ff", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.1)"; }}
          >
            <UserPlus style={{ width: "13px", height: "13px" }} />
            Nuevo Usuario
          </button>

          <button
            onClick={load}
            style={{
              background: "#131720", border: "1px solid #1e2535", borderRadius: "6px",
              padding: "8px 10px", color: "#4a5878", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3550"; (e.currentTarget as HTMLButtonElement).style.color = "#8a9ab8"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2535"; (e.currentTarget as HTMLButtonElement).style.color = "#4a5878"; }}
          >
            <RefreshCw style={{ width: "14px", height: "14px", animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>

        {/* Tabla */}
        <div style={{ background: "#131720", border: "1px solid #1e2535", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 110px 1fr 130px 1fr 140px 100px 108px",
            background: "#0f1218", borderBottom: "1px solid #1e2535", padding: "0 4px",
          }}>
            {["Nombre", "RUT", "Email", "Rol", "Institución", "Último acceso", "Estado", "Acciones"].map((h, i) => (
              <div key={i} style={{
                padding: "11px 12px", fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                color: "#4a5878", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
              }}>{h}</div>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 110px 1fr 130px 1fr 140px 100px 108px",
                borderBottom: "1px solid #1a2030", padding: "0 4px",
              }}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} style={{ padding: "14px 12px" }}>
                    <div style={{ height: "10px", background: "#1a2030", borderRadius: "3px", animation: "pulse 1.5s ease-in-out infinite", width: j === 0 ? "60%" : "75%" }} />
                  </div>
                ))}
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Users style={{ width: "32px", height: "32px", color: "#1e2535", margin: "0 auto 12px" }} />
              <div style={{ color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px" }}>
                {search || roleFilter || statusFilter ? "Sin resultados para el filtro" : "No hay usuarios registrados"}
              </div>
            </div>
          ) : filtered.map((u) => {
            const roleCfg = ROLE_CONFIG[u.role] || { color: "#4a5878", bg: "transparent", border: "#1e2535", label: u.role };
            const isHov      = hoveredRow === u.id;
            const isToggling = togglingId === u.id;

            return (
              <div
                key={u.id}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 110px 1fr 130px 1fr 140px 100px 108px",
                  borderBottom: "1px solid #1a2030", padding: "0 4px",
                  background: isHov ? "#1a2030" : "transparent",
                  transition: "background 0.1s", opacity: isToggling ? 0.5 : 1,
                }}
                onMouseEnter={() => setHoveredRow(u.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Nombre */}
                <div style={{ padding: "11px 12px", display: "flex", alignItems: "center", gap: "9px" }}>
                  <Avatar name={u.full_name} color={roleCfg.color} />
                  <div>
                    <div style={{ fontSize: "12px", color: "#e8edf2", fontWeight: 500 }}>{u.full_name}</div>
                    {u.institution && (
                      <div style={{ fontSize: "10px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "1px" }}>{u.institution}</div>
                    )}
                  </div>
                </div>

                {/* RUT */}
                <div style={{ padding: "11px 12px", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", color: "#8a9ab8", display: "flex", alignItems: "center" }}>
                  {u.rut}
                </div>

                {/* Email */}
                <div style={{ padding: "11px 12px", fontSize: "12px", color: "#8a9ab8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                  {u.email}
                </div>

                {/* Rol */}
                <div style={{ padding: "11px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                    color: roleCfg.color, background: roleCfg.bg, border: `1px solid ${roleCfg.border}`,
                    borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.03em",
                  }}>
                    {roleCfg.label}
                  </span>
                </div>

                {/* Institución */}
                <div style={{ padding: "11px 12px", fontSize: "12px", color: "#4a5878", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                  {u.institution || "—"}
                </div>

                {/* Último acceso */}
                <div style={{ padding: "11px 12px", fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: "#4a5878", display: "flex", alignItems: "center" }}>
                  {u.last_login ? formatDate(u.last_login) : "—"}
                </div>

                {/* Estado */}
                <div style={{ padding: "11px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: "10px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                    color: u.is_active ? "#2ed573" : "#4a5878",
                    background: u.is_active ? "rgba(46,213,115,0.08)" : "rgba(74,88,120,0.1)",
                    border: `1px solid ${u.is_active ? "rgba(46,213,115,0.25)" : "#1e2535"}`,
                    borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.04em",
                    display: "flex", alignItems: "center", gap: "5px",
                  }}>
                    <span style={{
                      width: "5px", height: "5px", borderRadius: "50%",
                      background: u.is_active ? "#2ed573" : "#4a5878",
                      animation: u.is_active ? "blink 2s ease-in-out infinite" : "none",
                    }} />
                    {u.is_active ? "ACTIVO" : "INACTIVO"}
                  </span>
                </div>

                {/* Acciones */}
                <div style={{ padding: "11px 12px", display: "flex", alignItems: "center", gap: "4px" }}>

                  {/* Editar */}
                  <ActionBtn
                    title="Editar usuario"
                    visible={isHov}
                    hoverColor="#00d4ff"
                    onClick={() => openEdit(u)}
                  >
                    <Pencil style={{ width: "13px", height: "13px" }} />
                  </ActionBtn>

                  {/* Toggle activo */}
                  <ActionBtn
                    title={u.is_active ? "Desactivar" : "Activar"}
                    visible={isHov}
                    hoverColor={u.is_active ? "#ffa502" : "#2ed573"}
                    onClick={() => toggleUser(u)}
                    disabled={isToggling}
                  >
                    {u.is_active
                      ? <UserX style={{ width: "13px", height: "13px" }} />
                      : <UserCheck style={{ width: "13px", height: "13px" }} />
                    }
                  </ActionBtn>

                  {/* Eliminar */}
                  <ActionBtn
                    title="Eliminar usuario"
                    visible={isHov}
                    hoverColor="#ff4757"
                    onClick={() => { setDeleteTarget(u); setShowDelete(true); }}
                  >
                    <Trash2 style={{ width: "13px", height: "13px" }} />
                  </ActionBtn>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: "12px", textAlign: "right", fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
            {filtered.length} {filtered.length === 1 ? "usuario" : "usuarios"}
            {(search || roleFilter || statusFilter) && ` · filtrado de ${users.length} total`}
          </div>
        )}
      </div>

      {/* ── Modal: Crear usuario ────────────────────────────────────────────────── */}
      {showCreate && (
        <ModalShell
          title="Nuevo Usuario"
          subtitle="Crear cuenta de acceso al sistema"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <GhostBtn onClick={() => setShowCreate(false)}>Cancelar</GhostBtn>
              <PrimaryBtn onClick={handleCreate} loading={saving} icon={<Plus style={{ width: "12px", height: "12px" }} />}>
                {saving ? "Creando..." : "Crear Usuario"}
              </PrimaryBtn>
            </>
          }
        >
          {/* Campo trampa: engaña al autofill para que no inyecte en los campos reales */}
          <input type="text" name="username" autoComplete="username" style={{ display: "none" }} readOnly />
          <input type="password" name="password_trap" autoComplete="current-password" style={{ display: "none" }} readOnly />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "12px" }}>
            <ModalInput label="Nombre completo" required>
              <input style={inp} placeholder="Nombre Apellido" value={createForm.full_name}
                autoComplete="off" name="full_name_new"
                onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} />
            </ModalInput>
            <ModalInput label="RUT" required>
              <input style={inp} placeholder="12345678-9" value={createForm.rut}
                autoComplete="off" name="rut_new"
                onChange={e => setCreateForm(f => ({ ...f, rut: e.target.value }))} />
            </ModalInput>
          </div>

          <ModalInput label="Email" required>
            <input type="email" style={inp} placeholder="usuario@hospital.cl" value={createForm.email}
              autoComplete="off" name="email_new"
              onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
          </ModalInput>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <ModalInput label="Rol">
              <select style={{ ...inp, cursor: "pointer" }} value={createForm.role}
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </ModalInput>
            <ModalInput label="Institución">
              <input style={inp} placeholder="Hospital / Clínica..." value={createForm.institution}
                autoComplete="off" name="institution_new"
                onChange={e => setCreateForm(f => ({ ...f, institution: e.target.value }))} />
            </ModalInput>
          </div>

          <ModalInput label="Contraseña" required>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                style={{ ...inp, paddingRight: "40px" }}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                name="new_password_create"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#4a5878", cursor: "pointer", padding: "2px",
                }}
              >
                {showPass ? <EyeOff style={{ width: "13px", height: "13px" }} /> : <Eye style={{ width: "13px", height: "13px" }} />}
              </button>
            </div>
          </ModalInput>
        </ModalShell>
      )}

      {/* ── Modal: Editar usuario ───────────────────────────────────────────────── */}
      {showEdit && editTarget && (
        <ModalShell
          title="Editar Usuario"
          subtitle={`Modificando cuenta de ${editTarget.full_name}`}
          onClose={() => { setShowEdit(false); setEditTarget(null); }}
          accentColor="#a78bfa"
          footer={
            <>
              <GhostBtn onClick={() => { setShowEdit(false); setEditTarget(null); }}>Cancelar</GhostBtn>
              <PrimaryBtn
                onClick={handleEdit}
                loading={saving}
                color="#a78bfa"
                icon={<Save style={{ width: "12px", height: "12px" }} />}
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </PrimaryBtn>
            </>
          }
        >
          {/* Info del usuario */}
          <div style={{
            padding: "10px 12px", background: "rgba(167,139,250,0.06)",
            border: "1px solid rgba(167,139,250,0.15)", borderRadius: "6px",
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            <Avatar name={editTarget.full_name} color={ROLE_CONFIG[editTarget.role]?.color || "#4a5878"} />
            <div>
              <div style={{ fontSize: "12px", color: "#e8edf2", fontWeight: 500 }}>{editTarget.full_name}</div>
              <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>RUT {editTarget.rut}</div>
            </div>
          </div>

          {/* Campo trampa para bloquear autofill */}
          <input type="text" name="username_edit" autoComplete="username" style={{ display: "none" }} readOnly />
          <input type="password" name="password_trap_edit" autoComplete="current-password" style={{ display: "none" }} readOnly />

          <ModalInput label="Nombre completo" required>
            <input style={inp} placeholder="Nombre Apellido" value={editForm.full_name}
              autoComplete="off" name="full_name_edit"
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
          </ModalInput>

          <ModalInput label="Email" required>
            <input type="email" style={inp} placeholder="usuario@hospital.cl" value={editForm.email}
              autoComplete="off" name="email_edit"
              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
          </ModalInput>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <ModalInput label="Rol">
              <select style={{ ...inp, cursor: "pointer" }} value={editForm.role}
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </ModalInput>
            <ModalInput label="Institución">
              <input style={inp} placeholder="Hospital / Clínica..." value={editForm.institution}
                autoComplete="off" name="institution_edit"
                onChange={e => setEditForm(f => ({ ...f, institution: e.target.value }))} />
            </ModalInput>
          </div>

          {/* Cambio de contraseña opcional */}
          <div style={{ borderTop: "1px solid #1e2535", paddingTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Cambiar contraseña
              </span>
              <span style={{ fontSize: "10px", color: "#2a3550", fontFamily: "IBM Plex Mono, monospace" }}>
                Opcional — dejar vacío para mantener la actual
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showNewPass ? "text" : "password"}
                style={{ ...inp, paddingRight: "40px" }}
                placeholder="Nueva contraseña (opcional)"
                autoComplete="new-password"
                name="new_password_edit"
                value={editForm.new_password}
                onChange={e => setEditForm(f => ({ ...f, new_password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowNewPass(p => !p)}
                style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#4a5878", cursor: "pointer", padding: "2px",
                }}
              >
                {showNewPass ? <EyeOff style={{ width: "13px", height: "13px" }} /> : <Eye style={{ width: "13px", height: "13px" }} />}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Modal: Confirmar eliminación ────────────────────────────────────────── */}
      {showDelete && deleteTarget && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowDelete(false); setDeleteTarget(null); } }}
        >
          <div style={{
            background: "#131720", border: "1px solid rgba(255,71,87,0.3)", borderRadius: "10px",
            width: "100%", maxWidth: "420px", overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}>
            {/* Header */}
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid #1e2535", background: "#0f1218",
              display: "flex", alignItems: "center", gap: "12px",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0,
                background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle style={{ width: "16px", height: "16px", color: "#ff4757" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2" }}>Eliminar usuario</div>
                <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "2px" }}>Esta acción no se puede deshacer</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "20px" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#8a9ab8", lineHeight: 1.6 }}>
                ¿Estás seguro de que deseas eliminar la cuenta de
              </p>
              <div style={{
                margin: "12px 0",
                padding: "12px 16px", background: "rgba(255,71,87,0.06)",
                border: "1px solid rgba(255,71,87,0.2)", borderRadius: "6px",
                display: "flex", alignItems: "center", gap: "10px",
              }}>
                <Avatar name={deleteTarget.full_name} color="#ff4757" />
                <div>
                  <div style={{ fontSize: "13px", color: "#e8edf2", fontWeight: 600 }}>{deleteTarget.full_name}</div>
                  <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace" }}>
                    {deleteTarget.email} · {ROLE_CONFIG[deleteTarget.role]?.label || deleteTarget.role}
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.6 }}>
                Se eliminarán todos los datos de acceso. Los informes asociados se conservarán.
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: "14px 20px", borderTop: "1px solid #1e2535",
              display: "flex", gap: "10px", justifyContent: "flex-end", background: "#0f1218",
            }}>
              <GhostBtn onClick={() => { setShowDelete(false); setDeleteTarget(null); }}>Cancelar</GhostBtn>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "8px 20px",
                  background: deleting ? "rgba(255,71,87,0.05)" : "rgba(255,71,87,0.12)",
                  border: "1px solid rgba(255,71,87,0.35)", borderRadius: "6px",
                  color: "#ff4757", fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
                  fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                {deleting
                  ? <><RefreshCw style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} /> Eliminando...</>
                  : <><Trash2 style={{ width: "12px", height: "12px" }} /> Eliminar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        input::placeholder { color: rgba(138,154,184,0.45) !important; }
        select option { background: #0f1218 !important; color: #e8edf2 !important; }
      `}</style>
    </div>
  );
}

// ── Helpers de UI ────────────────────────────────────────────────────────────

function ActionBtn({
  children, title, visible, hoverColor, onClick, disabled,
}: {
  children: React.ReactNode;
  title: string;
  visible: boolean;
  hoverColor: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "28px", height: "28px", borderRadius: "5px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hov ? `${hoverColor}18` : "transparent",
        border: hov ? `1px solid ${hoverColor}40` : "1px solid transparent",
        color: hov ? hoverColor : visible ? "#4a5878" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.12s", flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title, subtitle, accentColor = "#00d4ff", onClose, footer, children,
}: {
  title: string; subtitle?: string; accentColor?: string;
  onClose: () => void; footer: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#131720", border: `1px solid ${accentColor}30`, borderRadius: "10px",
        width: "100%", maxWidth: "520px", overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", maxHeight: "90vh",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #1e2535", background: "#0f1218", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#e8edf2" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "11px", color: "#4a5878", fontFamily: "IBM Plex Mono, monospace", marginTop: "2px" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5878", cursor: "pointer" }}>
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "13px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        <div style={{
          padding: "14px 20px", borderTop: "1px solid #1e2535",
          display: "flex", gap: "10px", justifyContent: "flex-end", background: "#0f1218", flexShrink: 0,
        }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 16px", background: "transparent", border: "1px solid #1e2535",
        borderRadius: "6px", color: "#8a9ab8", fontSize: "12px",
        fontFamily: "IBM Plex Mono, monospace", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  children, onClick, loading, icon, color = "#00d4ff",
}: {
  children: React.ReactNode; onClick: () => void; loading?: boolean;
  icon?: React.ReactNode; color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "8px 20px",
        background: loading ? `${color}08` : `${color}18`,
        border: `1px solid ${color}50`, borderRadius: "6px",
        color, fontSize: "12px", fontFamily: "IBM Plex Mono, monospace",
        fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", gap: "6px",
      }}
    >
      {loading
        ? <><RefreshCw style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} />{children}</>
        : <>{icon}{children}</>
      }
    </button>
  );
}
