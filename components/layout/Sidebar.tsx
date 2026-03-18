"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { canAccessRoute, ROLE_META, type Role } from "@/lib/permissions";
import {
  LayoutDashboard, ClipboardList, FileText, Sparkles,
  Users, LogOut, Shield, Activity, Lock, BrainCircuit, Settings2, X,
} from "lucide-react";

// ── Definición de todos los ítems de navegación ──────────────────────────────

const ALL_NAV: {
  href: string;
  icon: React.ElementType;
  label: string;
  section: "main" | "admin";
  badge?: string;
}[] = [
  // Sección principal
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard",   section: "main" },
  { href: "/worklist",  icon: ClipboardList,   label: "Worklist",    section: "main" },
  { href: "/reports",   icon: FileText,        label: "Informes",    section: "main" },
  { href: "/asistrad",  icon: Sparkles,        label: "AsistRad",    section: "main" },
  // Sección admin
  { href: "/admin/users",    icon: Users,         label: "Usuarios",   section: "admin" },
  { href: "/admin/audit",    icon: Shield,        label: "Auditoría",  section: "admin" },
  { href: "/admin/training", icon: BrainCircuit,  label: "Entrenamiento AI", section: "admin" },
  { href: "/admin/settings", icon: Settings2,     label: "Configuración", section: "admin" },
];

const mono = "var(--font-ibm-plex-mono), monospace";

// ── Componente NavLink ────────────────────────────────────────────────────────

function NavLink({
  href, icon: Icon, label, active, onClick,
}: { href: string; icon: React.ElementType; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 5, fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        color: active ? "#00d4ff" : "rgba(148,163,184,0.75)",
        background: active ? "rgba(0,212,255,0.07)" : "transparent",
        border: active ? "1px solid rgba(0,212,255,0.12)" : "1px solid transparent",
        textDecoration: "none", transition: "all 0.15s ease", position: "relative",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLElement).style.color = "#e2e8f0";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "rgba(148,163,184,0.75)";
        }
      }}
    >
      {active && (
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 2, height: 16, background: "#00d4ff",
          borderRadius: "0 2px 2px 0", boxShadow: "0 0 6px rgba(0,212,255,0.5)",
        }} />
      )}
      <Icon size={14} style={{ flexShrink: 0 }} />
      {label}
    </Link>
  );
}

// ── Componente LockedLink (ítem de menú bloqueado para el rol actual) ─────────

function LockedLink({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 5, fontSize: 12.5,
      color: "rgba(71,85,105,0.35)",
      border: "1px solid transparent",
      cursor: "not-allowed", userSelect: "none",
      position: "relative",
    }}
    title="Sin acceso para tu rol"
    >
      <Icon size={14} style={{ flexShrink: 0 }} />
      {label}
      <Lock size={9} style={{ marginLeft: "auto", opacity: 0.4 }} />
    </div>
  );
}

// ── Sidebar principal ─────────────────────────────────────────────────────────

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ mobileOpen, onMobileClose, isMobile }: SidebarProps) {
  const pathname  = usePathname();
  const { user, logout } = useAuthStore();
  const role = (user?.role ?? "TECNOLOGO") as Role;
  const roleMeta  = ROLE_META[role];

  // Filtra ítems que el rol puede ver (main y admin separados)
  const mainItems  = ALL_NAV.filter(i => i.section === "main");
  const adminItems = ALL_NAV.filter(i => i.section === "admin");

  // Admin section visible solo si el rol tiene acceso a algún ítem admin
  const showAdminSection = adminItems.some(i => canAccessRoute(role, i.href));

  // En móvil, si no está abierto, no renderizar
  if (isMobile && !mobileOpen) return null;

  const handleNavClick = () => {
    if (isMobile && onMobileClose) onMobileClose();
  };

  const sidebarContent = (
    <aside style={{
      width: isMobile ? 260 : 220, flexShrink: 0,
      display: "flex", flexDirection: "column",
      height: "100vh",
      position: isMobile ? "fixed" : "sticky",
      top: 0,
      left: 0,
      zIndex: isMobile ? 1001 : undefined,
      background: "#07090f",
      borderRight: "1px solid rgba(0,212,255,0.08)",
      fontFamily: mono,
      boxShadow: isMobile ? "4px 0 24px rgba(0,0,0,0.5)" : undefined,
    }}>

      {/* ── Logo + close button on mobile ──────────────────────────────────── */}
      <div style={{
        height: 56, display: "flex", alignItems: "center",
        padding: "0 16px", borderBottom: "1px solid rgba(0,212,255,0.07)", flexShrink: 0,
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)",
            borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 12px rgba(0,212,255,0.1)", flexShrink: 0,
          }}>
            <svg width="17" height="11" viewBox="0 0 17 11" fill="none">
              <path d="M1 5.5H3.5L5 1L7 10L8.5 3L10 8L11.5 4.5L13 6.5L14 5.5H16"
                stroke="#00d4ff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.04em" }}>
              RIS Voice<span style={{ color: "#00d4ff" }}>.</span>AI
            </div>
            <div style={{ fontSize: 9, color: "rgba(0,212,255,0.45)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              DMC Projects
            </div>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={onMobileClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(148,163,184,0.6)", padding: 4,
              display: "flex", alignItems: "center",
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Rol del usuario (badge) ────────────────────────────────────────────── */}
      <div style={{
        margin: "10px 8px 2px",
        padding: "6px 10px",
        background: `${roleMeta.color}08`,
        border: `1px solid ${roleMeta.color}20`,
        borderRadius: 5,
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: `${roleMeta.color}18`, border: `1px solid ${roleMeta.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10,
        }}>
          {roleMeta.icon}
        </div>
        <div>
          <div style={{ fontSize: 9, color: `${roleMeta.color}`, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {roleMeta.label}
          </div>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>

        {/* Sección: Sistema */}
        <div style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: "8.5px", color: "rgba(148,163,184,0.65)",
            textTransform: "uppercase", letterSpacing: "0.2em",
            padding: "4px 8px 6px",
          }}>
            Sistema
          </div>

          {mainItems.map(({ href, icon, label }) => {
            const active  = pathname === href || pathname.startsWith(href + "/");
            const allowed = canAccessRoute(role, href);

            return allowed
              ? <NavLink key={href} href={href} icon={icon} label={label} active={active} onClick={handleNavClick} />
              : <LockedLink key={href} icon={icon} label={label} />;
          })}
        </div>

        {/* Sección: Admin */}
        {showAdminSection && (
          <div>
            <div style={{
              fontSize: "8.5px", color: "rgba(148,163,184,0.65)",
              textTransform: "uppercase", letterSpacing: "0.2em",
              padding: "8px 8px 6px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              marginTop: 4,
            }}>
              Administración
            </div>

            {adminItems.map(({ href, icon, label }) => {
              const active  = pathname.startsWith(href);
              const allowed = canAccessRoute(role, href);

              return allowed
                ? <NavLink key={href} href={href} icon={icon} label={label} active={active} onClick={handleNavClick} />
                : <LockedLink key={href} icon={icon} label={label} />;
            })}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status indicator */}
        <div style={{
          margin: "8px 2px 4px", padding: "8px 10px",
          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,255,0.06)", borderRadius: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "#10b981", boxShadow: "0 0 5px #10b981", flexShrink: 0,
            }} />
            <span style={{ fontSize: 9, color: "rgba(148,163,184,0.85)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Sistema Activo
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Activity size={9} style={{ color: "rgba(0,212,255,0.35)", flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: "rgba(0,212,255,0.6)", letterSpacing: "0.08em" }}>
              BD Online · TLS 1.3
            </span>
          </div>
        </div>
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(0,212,255,0.07)", padding: "10px 8px", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px", marginBottom: 2,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: `${roleMeta.color}10`, border: `1px solid ${roleMeta.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontSize: 11, fontWeight: 600, color: roleMeta.color,
          }}>
            {user?.full_name?.[0] || "U"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.full_name}
            </div>
            <div style={{ fontSize: 9, color: "rgba(148,163,184,0.75)", letterSpacing: "0.08em" }}>
              {user?.institution || user?.rut}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { logout(); if (isMobile && onMobileClose) onMobileClose(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "7px 10px", borderRadius: 5, fontSize: 12,
            color: "rgba(100,116,139,0.6)", background: "transparent",
            border: "1px solid transparent", cursor: "pointer",
            fontFamily: mono, transition: "all 0.15s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = "#ff4757";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,71,87,0.06)";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,71,87,0.15)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = "rgba(100,116,139,0.6)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.borderColor = "transparent";
          }}
        >
          <LogOut size={13} style={{ flexShrink: 0 }} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  // En móvil, envolver en overlay
  if (isMobile) {
    return (
      <>
        {/* Overlay backdrop */}
        <div
          onClick={onMobileClose}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(2px)",
          }}
        />
        {sidebarContent}
      </>
    );
  }

  return sidebarContent;
}
