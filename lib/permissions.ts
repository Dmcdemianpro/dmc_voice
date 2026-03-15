export type Role = "ADMIN" | "JEFE_SERVICIO" | "RADIOLOGO" | "TECNOLOGO";

// ── Configuración visual por rol ─────────────────────────────────────────────
export const ROLE_META: Record<Role, { label: string; color: string; icon: string }> = {
  ADMIN:         { label: "Administrador",  color: "#ff4757", icon: "🛡️" },
  JEFE_SERVICIO: { label: "Jefe Servicio",  color: "#ffa502", icon: "👑" },
  RADIOLOGO:     { label: "Radiólogo",      color: "#00d4ff", icon: "🩺" },
  TECNOLOGO:     { label: "Tecnólogo",      color: "#2ed573", icon: "⚙️" },
};

// ── Permisos por ruta ─────────────────────────────────────────────────────────
// ADMIN siempre tiene acceso a todo — se verifica primero
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/dashboard":   ["ADMIN", "JEFE_SERVICIO", "RADIOLOGO", "TECNOLOGO"],
  "/worklist":    ["ADMIN", "JEFE_SERVICIO", "RADIOLOGO", "TECNOLOGO"],
  "/reports":     ["ADMIN", "JEFE_SERVICIO", "RADIOLOGO"],
  "/dictation":   ["ADMIN", "RADIOLOGO"],
  "/admin/users":     ["ADMIN", "JEFE_SERVICIO"],
  "/admin/audit":     ["ADMIN", "JEFE_SERVICIO"],
  "/admin/training":  ["ADMIN", "JEFE_SERVICIO"],
  "/admin/settings":  ["ADMIN"],
};

// ── Permisos de funcionalidad (para ocultar/mostrar elementos dentro de páginas)
export const FEATURE_PERMISSIONS: Record<string, Role[]> = {
  // Worklist
  "worklist.create":        ["ADMIN", "JEFE_SERVICIO", "TECNOLOGO"],
  "worklist.view_all":      ["ADMIN", "JEFE_SERVICIO", "TECNOLOGO"],
  "worklist.view_assigned": ["ADMIN", "JEFE_SERVICIO", "RADIOLOGO", "TECNOLOGO"],

  // Informes
  "reports.create":         ["ADMIN", "RADIOLOGO"],
  "reports.sign":           ["ADMIN", "RADIOLOGO"],
  "reports.view_all":       ["ADMIN", "JEFE_SERVICIO"],
  "reports.view_own":       ["ADMIN", "JEFE_SERVICIO", "RADIOLOGO"],

  // Dictado
  "dictation.use":          ["ADMIN", "RADIOLOGO"],

  // Usuarios
  "users.manage":           ["ADMIN"],
  "users.view":             ["ADMIN", "JEFE_SERVICIO"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica si un rol tiene acceso a una ruta (pathname) */
export function canAccessRoute(role: Role, pathname: string): boolean {
  if (role === "ADMIN") return true; // Admin siempre puede todo
  for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return roles.includes(role);
    }
  }
  return false;
}

/** Verifica si un rol tiene permiso para una funcionalidad específica */
export function hasPermission(role: Role, feature: string): boolean {
  if (role === "ADMIN") return true; // Admin siempre puede todo
  return FEATURE_PERMISSIONS[feature]?.includes(role) ?? false;
}

/** Ruta de inicio según el rol (redirect después del login) */
export function defaultRoute(role: Role): string {
  switch (role) {
    case "RADIOLOGO":
    case "TECNOLOGO":
      return "/worklist";
    default:
      return "/dashboard";
  }
}
