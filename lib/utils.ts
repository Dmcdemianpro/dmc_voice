import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
}

/** Validates Chilean RUT format (e.g. 12345678-9 or 12.345.678-9) */
export function validateRut(rut: string): boolean {
  const clean = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (clean.length < 8 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const remainder = sum % 11;
  const expected = remainder === 0 ? "0" : remainder === 1 ? "K" : String(11 - remainder);
  return dv === expected;
}

export function formatRut(rut: string): string {
  const clean = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

export const SEVERITY_COLORS: Record<string, string> = {
  NORMAL: "text-green-accent border-green-accent/30 bg-green-accent/5",
  LEVE: "text-amber-accent border-amber-accent/30 bg-amber-accent/5",
  MODERADO: "text-orange-400 border-orange-400/30 bg-orange-400/5",
  SEVERO: "text-red-alert border-red-alert/30 bg-red-alert/5",
  CRITICO: "text-white bg-red-alert border-red-alert",
};

export const CERTEZA_COLORS: Record<string, string> = {
  DEFINITIVO: "text-green-accent bg-green-accent/10 border-green-accent/20",
  PROBABLE: "text-cyan-accent bg-cyan-accent/10 border-cyan-accent/20",
  POSIBLE: "text-amber-accent bg-amber-accent/10 border-amber-accent/20",
  DESCARTADO: "text-text-muted bg-bg-elevated border-border",
};

export const URGENCIA_COLORS: Record<string, string> = {
  NO_REQUIERE: "text-green-accent",
  ELECTIVO: "text-cyan-accent",
  PREFERENTE: "text-amber-accent",
  URGENTE: "text-orange-400",
  INMEDIATO: "text-red-alert",
};
