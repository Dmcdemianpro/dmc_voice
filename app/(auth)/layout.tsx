"use client";

import Image from "next/image";
import { useMobile } from "@/hooks/useMobile";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isMobile } = useMobile();

  return (
    <div style={{
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        fontFamily: "var(--font-ibm-plex-mono), monospace",
        background: "#060810",
      }}>

        {/* ════════════ LEFT PANEL (hidden on mobile) ════════════ */}
        {!isMobile && (
        <div style={{
          flex: "0 0 58%",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(0,212,255,0.07)",
        }}>

          {/* Background layers */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(145deg, #070a12 0%, #0b1020 55%, #070c18 100%)",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(0,212,255,0.09) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(ellipse 90% 90% at 50% 50%, black 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 50%, black 30%, transparent 100%)",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 65% 55% at 48% 48%, rgba(0,212,255,0.07) 0%, transparent 65%)",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.5) 100%)",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 25%)",
          }} />

          {/* Scanline */}
          <div style={{
            position: "absolute", left: 0, right: 0, height: "120px", pointerEvents: "none",
            background: "linear-gradient(180deg, transparent 0%, rgba(0,212,255,0.025) 50%, transparent 100%)",
            animation: "scanPulse 9s linear infinite",
          }} />

          {/* Top nav bar */}
          <div style={{
            position: "relative", zIndex: 3,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "28px 48px 0",
            animation: "fadeUp 0.5s ease-out",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <Image
                src="/logo.png"
                alt="RIS Voice AI"
                width={30}
                height={30}
                style={{ borderRadius: 5 }}
              />
              <div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.05em" }}>
                  RIS Voice<span style={{ color: "#00d4ff" }}>.</span>AI
                </span>
              </div>
            </div>
            <span style={{
              fontSize: "8.5px", color: "rgba(0,212,255,0.3)",
              textTransform: "uppercase", letterSpacing: "0.22em",
            }}>SYS · RIS-001</span>
          </div>

          {/* Central visualization */}
          <div style={{
            flex: 1,
            position: "relative", zIndex: 2,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Outer decorative ring */}
            <div style={{
              position: "absolute",
              width: 440, height: 440,
              border: "1px dashed rgba(0,212,255,0.07)",
              borderRadius: "50%",
              animation: "ringRotate 30s linear infinite",
            }} />
            {/* Primary rotating ring */}
            <div style={{
              position: "absolute",
              width: 370, height: 370,
              borderRadius: "50%",
              border: "1px solid transparent",
              borderTop: "1.5px solid rgba(0,212,255,0.5)",
              borderRight: "1px solid rgba(0,212,255,0.15)",
              animation: "ringRotate 12s linear infinite",
            }} />
            {/* Secondary ring */}
            <div style={{
              position: "absolute",
              width: 310, height: 310,
              borderRadius: "50%",
              border: "1px solid transparent",
              borderBottom: "1.5px solid rgba(16,185,129,0.5)",
              borderLeft: "1px solid rgba(16,185,129,0.12)",
              animation: "ringRotateRev 8s linear infinite",
            }} />
            {/* Inner static ring */}
            <div style={{
              position: "absolute",
              width: 260, height: 260,
              border: "1px solid rgba(0,212,255,0.12)",
              borderRadius: "50%",
            }} />
            {/* Pulse ring */}
            <div style={{
              position: "absolute",
              width: 230, height: 230,
              border: "1.5px solid rgba(0,212,255,0.25)",
              borderRadius: "50%",
              animation: "pulseExpand 2.8s ease-out infinite",
            }} />
            {/* Second pulse ring (delayed) */}
            <div style={{
              position: "absolute",
              width: 230, height: 230,
              border: "1.5px solid rgba(0,212,255,0.15)",
              borderRadius: "50%",
              animation: "pulseExpand 2.8s ease-out 1.4s infinite",
            }} />

            {/* Core circle */}
            <div style={{
              position: "relative",
              width: 220, height: 220,
              background: "radial-gradient(circle at 38% 36%, rgba(0,212,255,0.22) 0%, rgba(0,212,255,0.06) 100%)",
              border: "1.5px solid rgba(0,212,255,0.45)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "coreBeat 3s ease-in-out infinite",
              boxShadow: "0 0 60px rgba(0,212,255,0.15), inset 0 0 40px rgba(0,212,255,0.08)",
            }}>
              <Image
                src="/logo.png"
                alt="RIS Voice AI"
                width={170}
                height={170}
                style={{
                  filter: "drop-shadow(0 0 16px rgba(0,212,255,0.4)) drop-shadow(0 0 40px rgba(0,212,255,0.15))",
                }}
              />
            </div>

            {/* Orbital tick marks */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const r = 195;
              const x = 50 + r * Math.sin(angle);
              const y = 50 - r * Math.cos(angle);
              return (
                <div key={i} style={{
                  position: "absolute",
                  left: `calc(50% + ${r * Math.sin(angle)}px - 1px)`,
                  top: `calc(50% - ${r * Math.cos(angle)}px - ${i % 3 === 0 ? 3 : 2}px)`,
                  width: i % 3 === 0 ? 2 : 1,
                  height: i % 3 === 0 ? 6 : 4,
                  background: i % 3 === 0 ? "rgba(0,212,255,0.5)" : "rgba(0,212,255,0.2)",
                  borderRadius: "1px",
                  transform: `rotate(${i * 30}deg)`,
                  transformOrigin: "bottom center",
                }} />
              );
            })}

            {/* Data cards — top */}
            <div style={{
              position: "absolute",
              top: "50%", transform: "translateY(-50%)",
              right: "calc(50% - 220px)",
              display: "flex", flexDirection: "column", gap: "8px",
            }}>
              {[
                { label: "Informes", value: "Certificados", color: "#f59e0b" },
                { label: "Dictado", value: "Voz a texto", color: "#10b981" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: "rgba(7,10,18,0.9)",
                  border: `1px solid ${color}22`,
                  borderLeft: `2px solid ${color}`,
                  borderRadius: "4px",
                  padding: "7px 13px",
                  minWidth: "96px",
                  backdropFilter: "blur(8px)",
                }}>
                  <div style={{ fontSize: "7.5px", color: `${color}88`, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Data cards — left */}
            <div style={{
              position: "absolute",
              top: "50%", transform: "translateY(-50%)",
              left: "calc(50% - 220px)",
              display: "flex", flexDirection: "column", gap: "8px",
            }}>
              {[
                { label: "Modalidad", value: "TC · RM · RX", color: "#00d4ff" },
                { label: "Análisis", value: "Automático", color: "#818cf8" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: "rgba(7,10,18,0.9)",
                  border: `1px solid ${color}22`,
                  borderLeft: `2px solid ${color}`,
                  borderRadius: "4px",
                  padding: "7px 13px",
                  minWidth: "96px",
                  backdropFilter: "blur(8px)",
                  textAlign: "right",
                }}>
                  <div style={{ fontSize: "7.5px", color: `${color}88`, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom brand + copy */}
          <div style={{
            position: "relative", zIndex: 3,
            padding: "0 48px 32px",
            animation: "fadeUp 0.7s ease-out 0.15s both",
          }}>
            {/* EKG strip */}
            <div style={{
              height: 40, marginBottom: "24px",
              borderTop: "1px solid rgba(0,212,255,0.06)",
              paddingTop: "12px",
              overflow: "hidden",
            }}>
              <svg width="200%" height="28" viewBox="0 0 1400 28" preserveAspectRatio="none"
                style={{ animation: "ekgScroll 6s linear infinite" }}>
                <path
                  d="M0,14 L55,14 L70,14 L80,3 L93,25 L104,6 L116,22 L125,14 L220,14 L232,10 L244,18 L253,14 L350,14 L362,14 L372,2 L385,26 L396,5 L408,23 L417,14 L510,14 L522,9 L535,19 L544,14 L638,14 L650,11 L663,17 L672,14 L700,14 L755,14 L770,14 L780,3 L793,25 L804,6 L816,22 L825,14 L920,14 L932,10 L944,18 L953,14 L1050,14 L1062,14 L1072,2 L1085,26 L1096,5 L1108,23 L1117,14 L1210,14 L1222,9 L1235,19 L1244,14 L1338,14 L1350,11 L1363,17 L1372,14 L1400,14"
                  fill="none"
                  stroke="rgba(0,212,255,0.6)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 style={{
              fontSize: "38px", fontWeight: 700, lineHeight: 1.08,
              color: "#f1f5f9", letterSpacing: "-0.025em",
              margin: "0 0 11px",
            }}>
              Dictado radiológico<br />
              <span style={{
                color: "transparent",
                backgroundImage: "linear-gradient(90deg, #00d4ff 0%, #38bdf8 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
              }}>inteligente</span>
            </h1>
            <p style={{
              fontSize: "11.5px", color: "rgba(100,116,139,0.65)",
              lineHeight: 1.75, maxWidth: "400px",
              marginBottom: "24px",
            }}>
              Informes clínicos por voz con análisis IA, integración FHIR R4
              y firma digital certificada.
            </p>

            {/* Status row */}
            <div style={{
              display: "flex", alignItems: "center", gap: "20px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(0,212,255,0.06)",
            }}>
              {[
                { label: "Sistema Activo", color: "#10b981" },
                { label: "Cifrado TLS 1.3", color: "#00d4ff" },
                { label: "BD Online", color: "#10b981" },
              ].map(({ label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    display: "inline-block",
                    width: 6, height: 6, borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 5px ${color}`,
                    animation: "statusBlink 2.5s ease-in-out infinite",
                  }} />
                  <span style={{
                    fontSize: "8.5px", color: "rgba(71,85,105,0.6)",
                    textTransform: "uppercase", letterSpacing: "0.14em",
                  }}>{label}</span>
                </div>
              ))}
              <span style={{
                marginLeft: "auto",
                fontSize: "8.5px", color: "rgba(71,85,105,0.3)",
                letterSpacing: "0.1em",
              }}>v1.0 · DMC Projects</span>
            </div>
          </div>
        </div>
        )}

        {/* ════════════ RIGHT PANEL ════════════ */}
        <div style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07090e",
          overflow: "hidden",
        }}>
          {/* Background texture */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(0,212,255,0.035) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)",
          }} />
          {/* Edge vignette from left panel */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: "60px", pointerEvents: "none",
            background: "linear-gradient(to right, rgba(0,212,255,0.02) 0%, transparent 100%)",
          }} />

          {/* Corner decoration */}
          <div style={{
            position: "absolute", top: 24, right: 24,
            width: 24, height: 24,
            borderTop: "1px solid rgba(0,212,255,0.18)",
            borderRight: "1px solid rgba(0,212,255,0.18)",
          }} />
          <div style={{
            position: "absolute", bottom: 24, right: 24,
            width: 24, height: 24,
            borderBottom: "1px solid rgba(0,212,255,0.18)",
            borderRight: "1px solid rgba(0,212,255,0.18)",
          }} />
          <div style={{
            position: "absolute", bottom: 24, left: 24,
            width: 24, height: 24,
            borderBottom: "1px solid rgba(0,212,255,0.1)",
            borderLeft: "1px solid rgba(0,212,255,0.1)",
          }} />

          {/* Mobile logo */}
          {isMobile && (
            <div style={{
              position: "absolute", top: 24, left: 24,
              display: "flex", alignItems: "center", gap: 9, zIndex: 2,
            }}>
              <Image
                src="/logo.png"
                alt="RIS Voice AI"
                width={30}
                height={30}
                style={{ borderRadius: 5 }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.05em" }}>
                RIS Voice<span style={{ color: "#00d4ff" }}>.</span>AI
              </span>
            </div>
          )}

          {/* Form card */}
          <div style={{
            position: "relative", zIndex: 1,
            width: "100%", maxWidth: "360px",
            padding: isMobile ? "0 20px" : "0 32px",
          }}>
            {children}
          </div>
        </div>

      </div>
  );
}
