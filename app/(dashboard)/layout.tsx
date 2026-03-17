"use client";

import React, { useEffect, useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { canAccessRoute, defaultRoute, type Role } from "@/lib/permissions";
import { useMobile } from "@/hooks/useMobile";

// Context para compartir estado mobile con páginas hijas
interface MobileCtx {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  toggleMenu: () => void;
}
const MobileContext = createContext<MobileCtx>({
  isMobile: false, isTablet: false, isDesktop: true, toggleMenu: () => {},
});
export const useMobileCtx = () => useContext(MobileContext);

// ── Error Boundary para capturar crashes del dashboard ──────────────────────
class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24, fontFamily: "monospace", background: "#0d111a",
          color: "#ff4757", minHeight: "100vh",
        }}>
          <h2 style={{ color: "#ff4757", fontSize: 16, marginBottom: 12 }}>
            Error en Dashboard
          </h2>
          <pre style={{
            background: "#131720", border: "1px solid #2a3550",
            borderRadius: 8, padding: 16, fontSize: 12,
            whiteSpace: "pre-wrap", wordBreak: "break-all",
            color: "#f59e0b", maxHeight: 300, overflow: "auto",
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => {
              localStorage.removeItem("ris-auth");
              localStorage.removeItem("access_token");
              localStorage.removeItem("refresh_token");
              window.location.href = "/login";
            }}
            style={{
              marginTop: 16, padding: "10px 20px",
              background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)",
              borderRadius: 6, color: "#00d4ff", fontSize: 12,
              fontFamily: "monospace", cursor: "pointer",
            }}
          >
            Limpiar sesión e ir al login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();
  const { isMobile, isTablet, isDesktop } = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Esperar a que zustand rehidrate desde localStorage antes de decidir
    if (!_hasHydrated) return;

    // 1. No autenticado → login
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    // 2. Autenticado pero sin acceso a la ruta actual → redirigir a inicio del rol
    const role = user?.role as Role | undefined;
    if (role && !canAccessRoute(role, pathname)) {
      router.replace(defaultRoute(role));
    }
  }, [_hasHydrated, isAuthenticated, user, pathname, router]);

  // Mientras zustand rehidrata, no renderizar nada (evita flash + redirect prematuro)
  if (!_hasHydrated) return null;
  if (!isAuthenticated) return null;

  // Mientras el rol no cargue, no renderizar nada (evita flash de contenido)
  const role = user?.role as Role | undefined;
  if (role && !canAccessRoute(role, pathname)) return null;

  return (
    <DashboardErrorBoundary>
      <MobileContext.Provider value={{
        isMobile, isTablet, isDesktop,
        toggleMenu: () => setMenuOpen(o => !o),
      }}>
        <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080b11" }}>
          <Sidebar
            isMobile={isMobile}
            mobileOpen={menuOpen}
            onMobileClose={() => setMenuOpen(false)}
          />
          <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
            {children}
          </main>
        </div>
      </MobileContext.Provider>
    </DashboardErrorBoundary>
  );
}
