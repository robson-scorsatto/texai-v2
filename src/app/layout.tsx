import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TEXAI 2.0 — Private Beta",
  description: "Ambiente privado de desenvolvimento da TEXAI 2.0. Não indexar.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
