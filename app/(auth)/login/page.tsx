"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { formatRut, validateRut } from "@/lib/utils";
import { Eye, EyeOff, AlertCircle, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";

const mono = "var(--font-ibm-plex-mono), monospace";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [rutFocus, setRutFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const { login, isLoading } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Show toast if session was closed due to inactivity
  useEffect(() => {
    const wasIdle = localStorage.getItem("idle_logout");
    if (!wasIdle) return;

    const savedFlag = localStorage.getItem("idle_logout_saved");
    localStorage.removeItem("idle_logout");
    localStorage.removeItem("idle_logout_saved");

    if (savedFlag === "ok") {
      toast.info(
        "Tu sesion se cerro por inactividad. Tu borrador fue guardado automaticamente.",
        { duration: 8000 },
      );
    } else if (savedFlag === "fail") {
      toast.warning(
        "Tu sesion se cerro por inactividad. No se pudo guardar el borrador.",
        { duration: 8000 },
      );
    } else {
      toast.info("Tu sesion se cerro por inactividad.", { duration: 6000 });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validateRut(rut)) {
      setError("RUT inválido. Formato esperado: 12345678-9");
      return;
    }
    try {
      await login(formatRut(rut), password);
      const redirect = searchParams.get("redirect");
      if (redirect && redirect.startsWith("https://") && redirect.includes(".dmcprojects.cl")) {
        window.location.href = redirect;
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Credenciales incorrectas");
    }
  };

  return (
    <div style={{ fontFamily: mono, width: "100%" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "40px" }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "7px",
          padding: "4px 12px 4px 8px",
          background: "rgba(0,212,255,0.05)",
          border: "1px solid rgba(0,212,255,0.14)",
          borderRadius: "99px",
          marginBottom: "22px",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 6px #10b981",
            display: "inline-block",
          }} />
          <span style={{
            fontSize: "9px", color: "rgba(0,212,255,0.95)",
            textTransform: "uppercase", letterSpacing: "0.2em",
          }}>Acceso institucional</span>
        </div>

        <h2 style={{
          fontSize: "27px", fontWeight: 700,
          color: "#f1f5f9", letterSpacing: "-0.02em",
          lineHeight: 1.15,
          margin: "0 0 10px",
        }}>
          Iniciar sesión
        </h2>
        <p style={{
          fontSize: "12px", color: "rgba(148,163,184,0.75)",
          margin: 0, lineHeight: 1.7,
        }}>
          Ingresa tus credenciales para acceder<br />
          al sistema RIS Voice<span style={{ color: "rgba(0,212,255,0.8)" }}>.</span>AI
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit}>

        {/* Divider */}
        <div style={{
          height: "1px",
          background: "linear-gradient(90deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.05) 60%, transparent 100%)",
          marginBottom: "28px",
        }} />

        {/* RUT */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "8px",
          }}>
            <label style={{
              fontSize: "9.5px", fontWeight: 500,
              color: rutFocus ? "rgba(0,212,255,0.95)" : "rgba(148,163,184,0.85)",
              textTransform: "uppercase", letterSpacing: "0.17em",
              transition: "color 0.2s",
            }}>
              RUT
            </label>
            <span style={{
              fontSize: "9px", color: "rgba(148,163,184,0.5)",
              letterSpacing: "0.05em",
            }}>12345678-5</span>
          </div>
          <input
            className="auth-input"
            type="text"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            onFocus={() => setRutFocus(true)}
            onBlur={() => setRutFocus(false)}
            placeholder="Tu RUT"
            required
            autoComplete="username"
            style={{
              fontFamily: mono,
              width: "100%",
              background: rutFocus
                ? "rgba(0,212,255,0.04)"
                : "rgba(255,255,255,0.025)",
              border: "1px solid",
              borderColor: error
                ? "rgba(255,71,87,0.45)"
                : rutFocus
                  ? "rgba(0,212,255,0.45)"
                  : "rgba(25,33,48,1)",
              borderRadius: "6px",
              padding: "12px 15px",
              fontSize: "14px", color: "#e2e8f0",
              outline: "none",
              transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
              boxShadow: rutFocus
                ? "0 0 0 3px rgba(0,212,255,0.07)"
                : "none",
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: "26px" }}>
          <label style={{
            display: "block",
            fontSize: "9.5px", fontWeight: 500,
            color: pwFocus ? "rgba(0,212,255,0.95)" : "rgba(148,163,184,0.85)",
            textTransform: "uppercase", letterSpacing: "0.17em",
            marginBottom: "8px",
            transition: "color 0.2s",
          }}>
            Contraseña
          </label>
          <div style={{ position: "relative" }}>
            <input
              className="auth-input"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPwFocus(true)}
              onBlur={() => setPwFocus(false)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                fontFamily: mono,
                width: "100%",
                background: pwFocus
                  ? "rgba(0,212,255,0.04)"
                  : "rgba(255,255,255,0.025)",
                border: "1px solid",
                borderColor: error
                  ? "rgba(255,71,87,0.45)"
                  : pwFocus
                    ? "rgba(0,212,255,0.45)"
                    : "rgba(25,33,48,1)",
                borderRadius: "6px",
                padding: "12px 44px 12px 15px",
                fontSize: "14px", color: "#e2e8f0",
                outline: "none",
                transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
                boxShadow: pwFocus
                  ? "0 0 0 3px rgba(0,212,255,0.07)"
                  : "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{
                position: "absolute", right: 13, top: "50%",
                transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(71,85,105,0.5)", padding: "4px",
                display: "flex", alignItems: "center",
                transition: "color 0.2s",
              }}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "9px",
            padding: "11px 13px",
            marginBottom: "18px",
            background: "rgba(255,71,87,0.05)",
            border: "1px solid rgba(255,71,87,0.18)",
            borderLeft: "3px solid rgba(255,71,87,0.7)",
            borderRadius: "6px",
            color: "rgba(255,80,96,0.9)", fontSize: "12px", lineHeight: 1.5,
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: "1px" }} />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            fontFamily: mono,
            width: "100%",
            padding: "14px 20px",
            background: isLoading
              ? "rgba(0,212,255,0.04)"
              : btnHover
                ? "linear-gradient(135deg, rgba(0,212,255,0.18) 0%, rgba(0,190,230,0.12) 100%)"
                : "linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(0,190,230,0.07) 100%)",
            border: "1px solid",
            borderColor: isLoading
              ? "rgba(0,212,255,0.2)"
              : btnHover
                ? "rgba(0,212,255,0.55)"
                : "rgba(0,212,255,0.35)",
            borderRadius: "6px",
            color: isLoading ? "rgba(0,212,255,0.4)" : "#00d4ff",
            fontSize: "10.5px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.2em",
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            transition: "all 0.2s ease",
            boxShadow: btnHover && !isLoading
              ? "0 0 28px rgba(0,212,255,0.14), 0 0 0 1px rgba(0,212,255,0.08)"
              : "0 0 12px rgba(0,212,255,0.04)",
          }}
        >
          {isLoading ? (
            <>
              <div style={{
                width: 13, height: 13, borderRadius: "50%",
                border: "2px solid rgba(0,212,255,0.2)",
                borderTopColor: "rgba(0,212,255,0.5)",
                animation: "loginSpin 0.7s linear infinite",
              }} />
              Autenticando...
            </>
          ) : (
            <>
              Ingresar al sistema
              <ArrowRight
                size={13}
                style={{
                  transform: btnHover ? "translateX(3px)" : "translateX(0)",
                  transition: "transform 0.2s",
                }}
              />
            </>
          )}
        </button>
      </form>

      {/* ── Footer ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "30px",
        paddingTop: "18px",
        borderTop: "1px solid rgba(25,33,48,0.8)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Lock size={9} style={{ color: "rgba(16,185,129,0.4)" }} />
          <span style={{
            fontSize: "8.5px", color: "rgba(148,163,184,0.5)",
            letterSpacing: "0.08em",
          }}>Ley 19.628 · Datos personales</span>
        </div>
        <span style={{
          fontSize: "8.5px", color: "rgba(148,163,184,0.4)",
          letterSpacing: "0.08em",
        }}>TLS 1.3</span>
      </div>

    </div>
  );
}
