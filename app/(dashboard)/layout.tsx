"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { canAccessRoute, defaultRoute, type Role } from "@/lib/permissions";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
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
  }, [isAuthenticated, user, pathname, router]);

  if (!isAuthenticated) return null;

  // Mientras el rol no cargue, no renderizar nada (evita flash de contenido)
  const role = user?.role as Role | undefined;
  if (role && !canAccessRoute(role, pathname)) return null;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080b11" }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
