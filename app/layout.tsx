import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getActiveCrewContext } from "@/lib/active-crew";
import { getRoster, getSession } from "@/lib/data";
import { ensureActiveSeasonCached } from "@/lib/season-service";
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
  // The roster query starts right away (it checks the session on its own, in
  // parallel with the query), so it overlaps the session lookup instead of
  // queueing behind it.
  const rosterPromise = getRoster();
  // If the session lookup throws, the roster promise rejects too; mark it
  // handled so only the original error surfaces.
  rosterPromise.catch(() => undefined);
  const session = await getSession();
  const user = session?.user;
  // Everything below depends only on the session, never on each other:
  //  - the roster (already in flight),
  //  - "Sezon 1" bootstrap on a signed-in user's first visit,
  //  - the active crew workspace: cookie → validated membership → first crew.
  const [players, , workspace] = await Promise.all([
    rosterPromise,
    user ? ensureActiveSeasonCached() : null,
    user ? getActiveCrewContext(user.id) : { activeCrewId: null, crews: [], cookieValid: true },
  ]);
  return (
    <AppShell
      user={session?.user ?? null}
      players={players}
      crews={workspace.crews}
      activeCrewId={workspace.activeCrewId}
    >
      {children}
    </AppShell>
  );
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
