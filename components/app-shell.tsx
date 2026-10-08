"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { ArrowUpRight, CircleDot, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Search, Shield, Trophy, UserRound, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";
import { RosterProvider, useRoster } from "@/components/roster-context";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CrewNav, type CrewNavItem } from "@/components/crew-nav";
import { NoticeProvider } from "@/components/notice-provider";
import { positions, type RosterPlayer } from "@/lib/football";
import { cn } from "@/lib/utils";

type ShellUser = { id: string; name?: string | null; image?: string | null; role: "PLAYER" | "CAPTAIN" };
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
// Menu order: Genel Bakış, Oyuncu Profilim, Ekibim (CrewNav), Ekipler, Yeni Maç.
const navigationBeforeCrew: NavItem[] = [{ href: "/", label: "Genel Bakış", icon: LayoutDashboard }, { href: "/profil", label: "Oyuncu Profilim", icon: UserRound }];
const navigationAfterCrew: NavItem[] = [{ href: "/ekipler", label: "Ekipler", icon: UsersRound }, { href: "/yeni-mac", label: "Yeni Maç", icon: CircleDot }];

export function AuthButton({ logout = false }: { logout?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function handleAuth() {
    setPending(true); setError("");
    try { if (logout) await signOut({ callbackUrl: "/" }); else await signIn("google", { callbackUrl: "/" }); }
    catch { setError("Bağlantı kurulamadı. Tekrar deneyin."); setPending(false); }
  }
  return <div><Button variant={logout ? "ghost" : "default"} disabled={pending} onClick={handleAuth} aria-label={logout ? "Çıkış yap" : "Google ile giriş yap"}>
    {pending ? <LoaderCircle className="animate-spin" /> : logout ? <LogOut /> : <ArrowUpRight />}
    {!logout && "Google ile giriş yap"}
  </Button>{error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}</div>;
}

function RosterSidebar({ selectable, crews, activeCrewId, onNavigate }: { selectable: boolean; crews: ReadonlyArray<CrewNavItem>; activeCrewId: string | null; onNavigate?: () => void }) {
  const { players, selectedIds, capacity, toggle } = useRoster();
  const pathname = usePathname();
  const id = useId();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const isSelecting = selectable && pathname === "/yeni-mac";
  const renderNavLink = (item: NavItem) => <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={pathname === item.href ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors", pathname === item.href ? "bg-emerald-400/10 text-emerald-300" : "text-zinc-400 hover:bg-white/5 hover:text-white")}><item.icon className="size-4" />{item.label}</Link>;
  const filtered = players.filter(p => p.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")) && (position === "ALL" || p.position === position));
  return <div className="flex h-full min-h-0 flex-col">
    <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-6 py-7"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950"><Trophy className="size-5" /></span><span className="font-black tracking-tight">TIKI-TAKA<span className="block text-[9px] font-medium tracking-[0.35em] text-zinc-500">MANAGER / CLUB OS</span></span></Link>
    <nav aria-label="Ana menü" className="space-y-1 px-4 pb-6">{navigationBeforeCrew.map(renderNavLink)}<CrewNav crews={crews} activeCrewId={activeCrewId} onNavigate={onNavigate} />{navigationAfterCrew.map(renderNavLink)}</nav>
    <div className="border-t border-white/10 px-5 pt-5"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold tracking-wide">GLOBAL OYUNCU HAVUZU</h2><span className="rounded bg-zinc-800 px-2 text-xs text-zinc-400">{players.length}</span></div>
      <p className="mt-2 text-xs text-zinc-500">{isSelecting ? `${selectedIds.length} / ${capacity} oyuncu seçildi` : "Tüm oyuncular. Tek bir saha."}</p>
      <div className="relative mt-4"><label htmlFor={id} className="sr-only">Kadroda oyuncu ara</label><Search className="absolute top-3 left-3 size-4 text-zinc-500" /><Input id={id} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Oyuncu ara…" className="h-10 bg-zinc-950/60 pl-9" /></div>
      <div className="my-3 flex gap-1" aria-label="Mevkii filtresi">{["ALL", ...positions].map(p => <button key={p} type="button" aria-pressed={position === p} onClick={() => setPosition(p)} className={cn("min-h-9 flex-1 rounded-md text-[10px] font-bold transition-colors", position === p ? "bg-zinc-700 text-white" : "text-zinc-500 hover:bg-zinc-800")}>{p === "ALL" ? "TÜMÜ" : p}</button>)}</div>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-5">
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{players.length ? "Aramana uygun oyuncu yok." : "Oyuncu havuzu henüz boş."}</p>}
      {filtered.map(p => { const selected = selectedIds.includes(p.id); return <div key={p.userId} className={cn("rounded-xl border transition-colors", selected && isSelecting ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/5 bg-zinc-950/40 hover:border-emerald-400/30")}>
        <Link href={`/oyuncu/${p.userId}`} onClick={onNavigate} aria-label={`${p.name} profilini aç`} className="flex items-center gap-3 rounded-xl p-3 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
          <PlayerAvatar name={p.name} image={p.image} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{p.name}</span><span className="mt-1 flex items-center gap-2"><span className="text-[10px] text-zinc-500">{p.position}</span><span className="flex gap-1" aria-label={`Son maçlar, yeniden eskiye: ${p.form.join(" ") || "henüz maç yok"}`}>{Array.from({ length: 5 }, (_, i) => <span key={i} title={p.form[i] || "Maç yok"} className={cn("flex size-3 items-center justify-center rounded-full text-[7px] font-bold", p.form[i] === "W" ? "bg-emerald-400/20 text-emerald-300" : p.form[i] === "L" ? "bg-rose-400/20 text-rose-300" : p.form[i] === "D" ? "bg-amber-300/20 text-amber-200" : "bg-zinc-800 text-zinc-600")}>{p.form[i] || "·"}</span>)}</span></span></span><OvrBadge value={p.ovrRating} isUnrated={p.isUnrated} />
        </Link>
        {isSelecting && <button type="button" onClick={() => toggle(p.id)} disabled={!p.id || (!selected && selectedIds.length >= capacity)} aria-pressed={selected} aria-label={`${p.name}, ${p.position}, ${p.isUnrated ? "bu ekipte puan yok" : `${Math.round(p.ovrRating)} OVR`}, ${selected ? "seçimi kaldır" : "seç"}`} className="min-h-9 w-full rounded-b-xl border-t border-white/10 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{selected ? "Kadrodan çıkar" : "Kadroya seç"}</button>}
      </div>; })}
    </div>
    <div className="flex items-center gap-2 border-t border-white/10 p-5 text-[10px] text-zinc-500"><Shield className="size-3 text-emerald-400" /> OVR topluluk oylarından, istatistikler maçlardan.</div>
  </div>;
}

export function AppShell({ user, players, crews, activeCrewId, children }: {
  user: ShellUser | null;
  players: RosterPlayer[];
  /** Crews the viewer belongs to; powers the workspace switcher in the header. */
  crews: Array<{ id: string; name: string }>;
  /** Resolved active crew (validated cookie or fallback). */
  activeCrewId: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Stable reference so the memoised crew menu is not re-rendered by the sheet state.
  const closeSheet = useCallback(() => setOpen(false), []);
  return <NoticeProvider><RosterProvider players={players}><div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,#064e3b22,transparent_45%)]">
    <a href="#main-content" className="sr-only z-[100] rounded bg-emerald-300 p-3 text-black focus:not-sr-only focus:fixed focus:top-2 focus:left-2">İçeriğe geç</a>
    {user && <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-zinc-950/80 backdrop-blur-xl lg:block"><RosterSidebar selectable={user.role === "CAPTAIN"} crews={crews} activeCrewId={activeCrewId} /></aside>}
    <div className={cn(user && "lg:pl-72")}>
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/70 px-4 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">{user ? <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline" size="icon" className="lg:hidden" aria-label="Oyuncu havuzunu aç"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-[min(90vw,320px)] gap-0 p-0"><SheetHeader className="sr-only"><SheetTitle>Oyuncu havuzu ve menü</SheetTitle><SheetDescription>Menüde gezin veya maçın için oyuncu seç.</SheetDescription></SheetHeader><RosterSidebar selectable={user.role === "CAPTAIN"} crews={crews} activeCrewId={activeCrewId} onNavigate={closeSheet} /></SheetContent></Sheet> : <Trophy className="size-6 text-emerald-400" />}<div><p className="text-sm font-semibold">{user ? "Kulüp Merkezi" : "TIKI-TAKA MANAGER"}</p><p className="hidden text-[10px] tracking-widest text-zinc-500 sm:block">YOUR GAME. YOUR LEGACY.</p></div></div>
        <div className="flex items-center gap-3">{user ? <><span className="hidden items-center gap-2 text-xs text-zinc-400 md:flex"><span className="size-1.5 rounded-full bg-emerald-400" />{user.role === "CAPTAIN" ? "Kaptan hesabı" : "Oyuncu hesabı"}</span>{crews.length > 0 && <WorkspaceSwitcher crews={crews} activeCrewId={activeCrewId} />}<Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/yeni-mac"><Plus />Maç oluştur</Link></Button><Link href="/profil" aria-label="Profilime git"><PlayerAvatar name={user.name || "Oyuncu"} image={user.image} /></Link><AuthButton logout /></> : <AuthButton />}</div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1600px] p-4 sm:p-8 lg:p-10">{children}</main>
      <footer className="flex justify-between border-t border-white/5 px-8 py-6 text-[10px] tracking-wider text-zinc-600"><span>TIKI-TAKA MANAGER</span><span className="flex items-center gap-2"><Users className="size-3" /> OYUNUN BİR PARÇASI OL.</span></footer>
    </div>
  </div></RosterProvider></NoticeProvider>;
}