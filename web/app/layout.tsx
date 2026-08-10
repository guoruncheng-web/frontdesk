import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Archivo is slightly condensed and industrial, which suits a console that has
// to fit a queue on one screen. JetBrains Mono carries every number, timing and
// log line — a triage run is read like a trace, and a trace wants fixed widths.
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Frontdesk — AI triage for support inboxes",
  description:
    "Classifies incoming support tickets, drafts replies for a human to approve, and shows what every model call cost.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
