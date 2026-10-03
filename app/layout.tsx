import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getRoster, getSession } from "@/lib/data";
import { ensureActiveSeason } from "@/lib/season-service";
import { Skeleton } from "@/components/ui/skeleton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Tiki-Taka Manager | Kulüp Merkezi", template: "%s | Tiki-Taka" },
  description: "Takımını kur, sahaya çık, izini bırak. Profesyonel halısaha yönetim platformu.",
};

async function Platform({ children }: { children: React.ReactNode }) {
  const [session, players] = await Promise.all([getSession(), getRoster()]);
  // Bootstraps "Sezon 1" the first time a signed-in user opens the app.
  if (session?.user) await ensureActiveSeason();
  return <AppShell user={session?.user ?? null} players={players}>{children}</AppShell>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full"><Suspense fallback={<div className="space-y-6 p-8" role="status" aria-label="Kulüp merkezi yükleniyor"><Skeleton className="h-16" /><Skeleton className="h-80" /></div>}><Platform>{children}</Platform></Suspense></body>
    </html>
  );
}
