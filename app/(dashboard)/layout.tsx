"use client";

import { useEffect, useState, createContext, useContext } from "react";
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
  );
}
