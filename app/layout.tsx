import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { IBM_Plex_Mono } from "next/font/google";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "RIS Voice AI — DMC Projects",
  description: "Sistema de Reconocimiento de Voz para Radiología e Imagenología",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={ibmPlexMono.variable}>
      <body className="bg-bg-primary text-text-primary font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: "#131720",
              border: "1px solid #1e2535",
              color: "#e8edf2",
            },
          }}
        />
      </body>
    </html>
  );
}
