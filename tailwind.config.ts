import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0d12",
          surface: "#131720",
          elevated: "#1a2030",
        },
        border: {
          DEFAULT: "#1e2535",
          active: "#2a3550",
        },
        text: {
          primary: "#e8edf2",
          secondary: "#8a9ab8",
          muted: "#4a5878",
        },
        cyan: {
          accent: "#00d4ff",
          dim: "rgba(0,212,255,0.15)",
          glow: "rgba(0,212,255,0.08)",
        },
        red: {
          alert: "#ff4757",
          dim: "rgba(255,71,87,0.15)",
        },
        green: {
          accent: "#2ed573",
        },
        amber: {
          accent: "#ffa502",
        },
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["IBM Plex Sans", "sans-serif"],
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        waveform: "waveform 1.2s ease-in-out infinite",
        "scan-line": "scanLine 3s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(255,71,87,0.5), 0 0 20px rgba(255,71,87,0.2)" },
          "50%": { boxShadow: "0 0 15px rgba(255,71,87,0.8), 0 0 40px rgba(255,71,87,0.4)" },
        },
        waveform: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      boxShadow: {
        "cyan-glow": "0 0 20px rgba(0,212,255,0.15), 0 0 40px rgba(0,212,255,0.05)",
        "red-glow": "0 0 20px rgba(255,71,87,0.3), 0 0 40px rgba(255,71,87,0.1)",
        "surface": "0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
