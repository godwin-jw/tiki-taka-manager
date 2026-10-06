import Link from "next/link";
import { ArrowUpRight, CalendarDays, Crown, Medal, Plus, Swords, Target, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/player-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthButton } from "@/components/app-shell";
import { MatchDeleteControl } from "@/components/match-delete-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveCrewContext } from "@/lib/active-crew";
import { getCrewSeasonLeaders } from "@/lib/crew-leaders";
import { sortByStats } from "@/lib/football";

export function Welcome() {
  return <div className="py-8 sm:py-16"><section className="relative grid items-center gap-14 overflow-hidden lg:grid-cols-2"><div className="space-y-8"><p className="eyebrow">THE NEXT LEVEL OF YOUR GAME</p><h1 className="text-5xl leading-[1.05] font-black tracking-tighter sm:text-7xl">Sadece oynama.<br /><span className="text-emerald-400">Oyuna yön ver.</span></h1><p className="max-w-md text-base leading-relaxed text-zinc-400">Halısaha rekabetine profesyonel bir dokunuş. Dengeli takımlar, akıllı kadrolar ve her maçla büyüyen bir kariyer.</p><AuthButton /><p className="flex items-center gap-2 text-xs text-zinc-500"><Users className="size-4" />Tek Google hesabı. Tüm takımın aynı yerde.</p></div><div className="glass relative overflow-hidden border-emerald-400/20 p-8 sm:p-12"><div className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-emerald-500/10 blur-3xl" /><div className="flex items-center justify-between"><span className="eyebrow">YOUR CLUB. CONNECTED.</span><Trophy className="size-6 text-amber-300" /></div><div aria-hidden="true" className="pitch relative my-8 flex h-64 items-center justify-center rounded-xl border border-emerald-100/20"><div className="absolute inset-4 border border-white/15" /><div className="absolute left-1/2 h-full border-l border-white/15" /><div className="size-24 rounded-full border border-white/20" /><Swords className="absolute size-12 text-emerald-100" /></div><div className="grid grid-cols-3 gap-3 text-center">{["Dengeli kadro", "Canlı rekabet", "Kalıcı istatistik"].map((label, i) => <div key={label}><span className="font-mono text-2xl text-emerald-300">0{i + 1}</span><p className="mt-2 text-[10px] text-zinc-400">{label}</p></div>)}</div></div></section><div className="mt-16 grid gap-5 md:grid-cols-3">{[{ icon: Swords, title: "Adil eşleşme", text: "OVR tabanlı yılan algoritmasıyla rekabetçi kadrolar." }, { icon: Target, title: "Her katkı değerli", text: "Gol, asist ve maçın adamı ödülleri tek bir profilde." }, { icon: Crown, title: "Kontrol kaptanda", text: "Esnek taktik tahtası ve güvenli maç sonu raporları." }].map(item => <Card key={item.title} className="glass"><CardHeader><item.icon className="mb-3 size-5 text-emerald-400" /><CardTitle>{item.title}</CardTitle></CardHeader><CardContent className="text-sm text-zinc-400">{item.text}</CardContent></Card>)}</div></div>;
}

async function Leaderboards() {
  const fields = ["goals", "assists", "motmCount"] as const;
  const leaders = await Promise.all(fields.map(field => prisma.playerProfile.findMany({ where: { [field]: { gt: 0 } }, orderBy: [{ [field]: "desc" }, { id: "asc" }], take: 5, select: { id: true, goals: true, assists: true, motmCount: true, user: { select: { name: true, image: true } } } })));
  const meta = [{ title: "Gol Krallığı", subtitle: "GOLDEN BOOT", icon: Target }, { title: "Asist Krallığı", subtitle: "PLAYMAKERS", icon: Medal }, { title: "En Çok MOTM", subtitle: "GAME CHANGERS", icon: Crown }];
  return <section aria-label="Liderlik tabloları" className="grid gap-5 xl:grid-cols-3">{meta.map((item, i) => <Card key={item.title} className="glass gap-0 overflow-hidden py-0"><CardHeader className="border-b border-white/5 p-5"><div className="flex items-center justify-between"><p className="text-[9px] tracking-[0.2em] text-zinc-500">{item.subtitle}</p><item.icon className="size-4 text-amber-200" /></div><CardTitle className="mt-2 text-lg">{item.title}</CardTitle></CardHeader><CardContent className="p-0"><ol className="divide-y divide-white/5">{leaders[i].map((p, rank) => <li key={p.id} className="flex items-center gap-3 px-5 py-4"><span className={`w-3 font-mono text-xs ${rank === 0 ? "text-amber-300" : "text-zinc-500"}`}>{rank + 1}</span><PlayerAvatar name={p.user.name || "Oyuncu"} image={p.user.image} className="size-8" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{p.user.name || "Oyuncu"}</span><span className="font-mono text-lg font-bold text-emerald-300">{p[fields[i]]}</span></li>)}</ol>{!leaders[i].length && <p className="p-8 text-center text-xs leading-6 text-zinc-500">Henüz sıralama oluşmadı.<br />İlk onaylı maçla hikâye başlasın.</p>}</CardContent></Card>)}</section>;
}

export async function Dashboard({ userId, name }: { userId: string; name: string }) {
  // The platform dashboard is the global archive: crew-scoped matches belong to
  // their crew's own page and must not leak in here, and the reverse must not
  // happen either, so both the aggregate and the list filter on crewId: null.
  const [playerCount, matchCount, total, matches, groups, activeCrew] = await Promise.all([
    prisma.user.count(), prisma.match.count({ where: { status: "COMPLETED", groupId: null, crewId: null } }),
    prisma.playerProfile.aggregate({ _sum: { goals: true } }),
    prisma.match.findMany({ where: { groupId: null, crewId: null }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 8, select: { id: true, date: true, status: true, createdById: true, teamAName: true, teamBName: true, teamAScore: true, teamBScore: true, _count: { select: { players: true } } } }),
    prisma.group.findMany({ where: { OR: [{ captainId: userId }, { players: { some: { userId } } }] }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    // The "Ekip İçi" tab reads the same workspace cookie as the header switcher.
    getActiveCrewContext(userId),
  ]);
  return <div className="space-y-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">CLUB OVERVIEW</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Hoş geldin, {name.split(" ")[0]}.</h1><p className="mt-2 text-sm text-zinc-400">Bir sonraki maç, bir sonraki hikâye.</p></div><Button asChild><Link href="/yeni-mac"><Plus />Yeni maç oluştur</Link></Button></div><Tabs defaultValue="genel"><TabsList><TabsTrigger value="genel">Genel</TabsTrigger><TabsTrigger value="ekip">Ekip İçi</TabsTrigger></TabsList><TabsContent value="genel" className="space-y-8">
    <section className="glass relative overflow-hidden border-emerald-400/15 p-7 sm:p-10"><div className="pointer-events-none absolute -right-10 -bottom-20 size-72 rounded-full bg-emerald-400/10 blur-3xl" /><p className="eyebrow">BU SAHA SENİN</p><h2 className="mt-4 max-w-xl text-3xl leading-tight font-black sm:text-4xl">Kadronu kur.<br /><span className="text-emerald-400">Farkını sahada göster.</span></h2><p className="mt-4 max-w-lg text-sm leading-6 text-zinc-400">Oyuncu havuzundan seçim yap, dengeli takımları oluştur ve maçın yıldızlarını birlikte keşfet.</p><Button asChild variant="outline" className="mt-6"><Link href="/profil">Oyuncu kartımı düzenle<ArrowUpRight /></Link></Button><Swords className="pointer-events-none absolute right-12 bottom-12 hidden size-36 -rotate-12 text-emerald-400/10 md:block" /></section>
    <div className="grid grid-cols-3 gap-3 sm:gap-5">{[{ label: "Global oyuncu", value: playerCount, icon: Users }, { label: "Tamamlanan maç", value: matchCount, icon: Swords }, { label: "Kariyer golleri", value: total._sum.goals ?? 0, icon: Target }].map(item => <div key={item.label} className="glass p-4 sm:p-6"><item.icon className="mb-4 size-4 text-emerald-400" /><p className="font-mono text-2xl font-bold sm:text-3xl">{item.value}</p><p className="mt-2 text-[10px] text-zinc-500 sm:text-xs">{item.label}</p></div>)}</div>
    <div><div className="mb-5 flex items-center gap-2"><Trophy className="size-5 text-amber-300" /><h2 className="text-xl font-bold">Sahanın liderleri</h2></div><Leaderboards /></div>
    <section className="glass overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="font-semibold">Maç merkezi</h2><span className="text-[10px] text-zinc-500">SON 8 MAÇ</span></div>{!matches.length && <div className="p-10 text-center"><CalendarDays className="mx-auto mb-3 size-7 text-zinc-600" /><p className="text-sm text-zinc-400">Henüz global maç oluşturulmadı.</p><Button asChild variant="link" className="mt-2"><Link href="/yeni-mac">İlk maçı oluştur</Link></Button></div>}<div className="divide-y divide-white/5">{matches.map(match => <div key={match.id} className="flex items-center"><Link href={`/mac/${match.id}`} className="flex flex-1 items-center justify-between gap-4 p-5 transition-colors hover:bg-white/5"><div><p className="text-sm font-semibold">{match.teamAName} <span className="mx-2 text-zinc-600">vs</span> {match.teamBName}</p><p className="mt-1 text-[11px] text-zinc-500">{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(match.date)} · {match._count.players} oyuncu{match.createdById === userId ? " · Senin maçın" : ""}</p></div><div className="flex items-center gap-4"><span className="font-mono text-lg font-bold">{match.status === "COMPLETED" ? `${match.teamAScore} : ${match.teamBScore}` : "— : —"}</span><span className="hidden rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300 sm:block">{match.status === "COMPLETED" ? "TAMAMLANDI" : match.status === "ONGOING" ? "RAPOR BEKLİYOR" : match.status === "CANCELLED" ? "İPTAL" : "TASLAK"}</span><ArrowUpRight className="size-4 text-zinc-500" /></div></Link>{match.createdById === userId && <MatchDeleteControl matchId={match.id} teamAName={match.teamAName} teamBName={match.teamBName} />}</div>)}</div></section>
    {groups.length > 0 && <section><h2 className="mb-3 text-sm font-semibold text-zinc-400">Eski grup arşivin</h2><div className="flex flex-wrap gap-2">{groups.map(group => <Button key={group.id} asChild variant="outline" size="sm"><Link href={`/grup/${group.id}`}>{group.name}<ArrowUpRight /></Link></Button>)}</div></section>}</TabsContent><TabsContent value="ekip" className="space-y-8"><CrewOverview crewId={activeCrew.activeCrewId} crewName={activeCrew.crews.find(crew => crew.id === activeCrew.activeCrewId)?.name ?? null} userId={userId} /></TabsContent></Tabs>
  </div>;
}

/**
 * "Ekip İçi" tab body: everything scoped to the ACTIVE crew from the workspace
 * cookie — member count, completed crew matches, goals scored in those matches,
 * the crew's own standings (contextual OVR + stats rebuilt from this crew's
 * MatchPlayer rows only) and the recent crew fixtures.
 *
 * Returns an onboarding card instead when the viewer has no active crew, so the
 * tab never renders platform-wide data under a crew heading.
 */
async function CrewOverview({ crewId, crewName, userId }: { crewId: string | null; crewName: string | null; userId: string }) {
  if (!crewId) {
    return <section className="glass space-y-4 p-10 text-center"><Users className="mx-auto size-8 text-emerald-400" /><h2 className="text-xl font-bold">Aktif bir ekipte değilsin.</h2><p className="text-sm text-zinc-400">Ekip istatistiklerini görmek için bir ekibe katıl; katıldıktan sonra başlıktaki ekip seçiciden istediğin ekibi seçebilirsin.</p><Button asChild className="mt-2"><Link href="/ekipler">Ekiplere git</Link></Button></section>;
  }
  const [memberCount, completedCount, goalTotal, crewMatches, season] = await Promise.all([
    prisma.crewMember.count({ where: { crewId } }),
    prisma.match.count({ where: { crewId, status: "COMPLETED", groupId: null } }),
    prisma.matchPlayer.aggregate({ where: { match: { crewId, status: "COMPLETED", groupId: null } }, _sum: { goals: true } }),
    prisma.match.findMany({ where: { crewId, groupId: null }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 8, select: { id: true, date: true, status: true, createdById: true, teamAName: true, teamBName: true, teamAScore: true, teamBScore: true, _count: { select: { players: true } } } }),
    prisma.season.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  const standings = season ? await getCrewSeasonLeaders(prisma, crewId, season.id) : null;
  // Top scorers of THIS crew; the OVR column is the crew's own vote average.
  const leaders = sortByStats(standings?.rows ?? [], "goals").slice(0, 8);
  const tiles = [
    { label: "Ekip üyesi", value: memberCount, icon: Users },
    { label: "Tamamlanan ekip maçı", value: completedCount, icon: Swords },
    { label: "Ekip golleri", value: goalTotal._sum.goals ?? 0, icon: Target },
  ];
  return <div className="space-y-8">
    <section className="glass relative overflow-hidden border-emerald-400/15 p-7 sm:p-10">
      <div className="pointer-events-none absolute -right-10 -bottom-20 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <p className="eyebrow">AKTİF EKİP</p>
      <h2 className="mt-4 text-3xl font-black sm:text-4xl">{crewName}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">Bu sekmedeki her sayı yalnızca bu ekibin maçlarından ve kendi oylarından gelir; diğer ekiplerin ve global arşivin verisi buraya karışmaz.</p>
    </section>
    <div className="grid grid-cols-3 gap-3 sm:gap-5">{tiles.map(item => <div key={item.label} className="glass p-4 sm:p-6"><item.icon className="mb-4 size-4 text-emerald-400" /><p className="font-mono text-2xl font-bold sm:text-3xl">{item.value}</p><p className="mt-2 text-[10px] text-zinc-500 sm:text-xs">{item.label}</p></div>)}</div>
    <section className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="font-semibold">Ekip liderleri</h2><span className="text-[10px] text-zinc-500">GOL · ASİST · OVR</span></div>
      {leaders.length === 0
        ? <p className="p-8 text-center text-sm text-zinc-400">Bu ekibe henüz oyuncu katılmadı.</p>
        : <ol className="divide-y divide-white/5">{leaders.map((row, index) => <li key={row.userId}><Link href={`/oyuncu/${row.userId}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-white/5"><span className={`w-5 font-mono text-xs ${index === 0 ? "text-amber-300" : "text-zinc-500"}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span><span className="font-mono text-xs text-zinc-400">{row.goals}G {row.assists}A</span><span className="w-10 text-right font-mono text-sm font-bold text-emerald-300">{row.isUnrated ? "—" : Math.round(row.ovrRating)}</span></Link></li>)}</ol>}
    </section>
    <section className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="font-semibold">Ekip maç merkezi</h2><span className="text-[10px] text-zinc-500">SON 8 EKİP MAÇI</span></div>
      {!crewMatches.length && <div className="p-10 text-center"><CalendarDays className="mx-auto mb-3 size-7 text-zinc-600" /><p className="text-sm text-zinc-400">Bu ekipte henüz maç oluşturulmadı.</p><Button asChild variant="link" className="mt-2"><Link href="/yeni-mac">İlk maçı oluştur</Link></Button></div>}
      <div className="divide-y divide-white/5">{crewMatches.map(match => <div key={match.id} className="flex items-center"><Link href={`/mac/${match.id}`} className="flex flex-1 items-center justify-between gap-4 p-5 transition-colors hover:bg-white/5"><div><p className="text-sm font-semibold">{match.teamAName} <span className="mx-2 text-zinc-600">vs</span> {match.teamBName}</p><p className="mt-1 text-[11px] text-zinc-500">{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(match.date)} · {match._count.players} oyuncu{match.createdById === userId ? " · Senin maçın" : ""}</p></div><div className="flex items-center gap-4"><span className="font-mono text-lg font-bold">{match.status === "COMPLETED" ? `${match.teamAScore} : ${match.teamBScore}` : "— : —"}</span><span className="hidden rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300 sm:block">{match.status === "COMPLETED" ? "TAMAMLANDI" : match.status === "ONGOING" ? "RAPOR BEKLİYOR" : match.status === "CANCELLED" ? "İPTAL" : "TASLAK"}</span><ArrowUpRight className="size-4 text-zinc-500" /></div></Link>{match.createdById === userId && <MatchDeleteControl matchId={match.id} teamAName={match.teamAName} teamBName={match.teamBName} />}</div>)}</div>
    </section>
  </div>;
}
