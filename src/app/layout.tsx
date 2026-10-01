import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compta SYCEBNL+ — Gestion comptable des associations",
  description:
    "Tenue comptable SYCEBNL, suivi budgétaire des projets et rapports financiers pour les organisations à but non lucratif.",
  applicationName: "Compta SYCEBNL+",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#142b23", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
