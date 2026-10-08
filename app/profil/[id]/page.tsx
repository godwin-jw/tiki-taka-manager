import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarRange, Crown, LockKeyhole, Medal, ShieldCheck, Swords, Target, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSeasons } from "@/lib/season-data";
import { SeasonPicker, SeasonReadOnlyNote } from "@/components/season-picker";
import { PlayerCard } from "@/components/player-card";
import { RatingSummary } from "@/components/rating-summary";
import { getCrewRatingSummary } from "@/lib/rating-data";
import { getActiveCrewContext } from "@/lib/active-crew";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { positionLabels } from "@/lib/football";

export const metadata: Metadata = { title: "Oyuncu Profili" };

/**
 * Read-only stat tile. Deliberately a plain div with no input, form or link, so
 * the value cannot be edited or tampered with from the UI.
 */
function StatTile({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Swords }) {
  return <div className="glass p-5">
    <div className="flex items-start justify-between">
      <Icon className="size-5 text-emerald-400" aria-hidden />
      <LockKeyhole className="size-3 text-zinc-700" aria-hidden />
    </div>
    <p className="mt-4 font-mono text-3xl font-bold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-zinc-400">{label}</p>
  </div>;
}

export default async function PublicProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const viewer = await requireUser();
  const [{ id }, { season: requestedSeason }] = await Promise.all([params, searchParams]);

  // Public fields only: phone, email and individual votes stay private.
  const player = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, image: true, role: true,
      playerProfile: { select: { id: true, position: true, jerseyNumber: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true } },
      crewMemberships: { select: { crew: { select: { id: true, name: true } } }, take: 1 },
    },
  });
  if (!player?.playerProfile) notFound();
  const profile = player.playerProfile;

  // Stats are the ACTIVE crew's verdict and strictly read-only on this page.
  const [workspace, seasons, timeline, recentMatches] = await Promise.all([
    getActiveCrewContext(viewer.id),
    listSeasons(),
    prisma.playerSeasonStat.findMany({
      where: { playerProfileId: profile.id },
      select: { seasonId: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true },
    }),
    // GÖREV 5: per-match goal/assist line for the "Son Maçlar" table. Only
    // completed, non-group matches — the same archive the career counters use.
    prisma.matchPlayer.findMany({
      where: { playerProfileId: profile.id, match: { status: "COMPLETED", groupId: null } },
      orderBy: [{ match: { date: "desc" } }, { matchId: "desc" }],
      take: 10,
      select: {
        goals: true, assists: true, isMotm: true,
        match: { select: { id: true, date: true, teamAName: true, teamBName: true, teamAScore: true, teamBScore: true } },
      },
    }),
  ]);
  const summary = await getCrewRatingSummary(workspace.activeCrewId, player.id);
  const activeCrewName = workspace.crews.find((crew) => crew.id === workspace.activeCrewId)?.name ?? null;

  // Default to the live season; fall back to the requested one, then to active.
  const activeSeason = seasons.find((season) => season.isActive);
  const selected = seasons.find((season) => season.id === requestedSeason) ?? activeSeason ?? seasons[0] ?? null;
  const selectedStat = selected ? timeline.find((row) => row.seasonId === selected.id) : undefined;

  const crew = player.crewMemberships[0]?.crew;
  const isSelf = player.id === viewer.id;
  const seasonStats = selectedStat
    ? [
        { label: "OVR", value: Math.round(selectedStat.ovrRating), icon: Swords, accent: true },
        { label: "Gol", value: selectedStat.goals, icon: Target },
        { label: "Asist", value: selectedStat.assists, icon: Medal },
        { label: "Maçın adamı", value: selectedStat.motmCount, icon: Trophy },
      ]
    : [];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={isSelf ? "/profil" : "/"} className="text-xs text-zinc-400 hover:text-white">{isSelf ? "← Kendi profilin" : "← Kulüp merkezine dön"}</Link>
      {crew && <Link href={`/ekip/${crew.id}`} className="text-xs text-emerald-300 hover:text-emerald-200">Ekibi: {crew.name}</Link>}
    </div>

    {/* Bento grid: 12 columns on desktop, each tile spanning a deliberate size. */}
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 [&>*]:min-w-0">
      <Card className="glass relative gap-0 overflow-hidden border-0 py-0 lg:col-span-5 xl:col-span-4">
        <CardContent className="flex flex-col items-center gap-6 p-6 text-center">
          <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
          <PlayerCard
            name={player.name || "Oyuncu"}
            image={player.image}
            position={profile.position}
            ovr={summary.ovr}
            jerseyNumber={profile.jerseyNumber}
            captain={player.role === "CAPTAIN"}
            scores={summary.scores}
            ratingCount={summary.count}
            className="relative mx-auto"
          />
          <div className="relative space-y-3">
            <h1 className="text-2xl font-bold break-words">{player.name || "Oyuncu"}</h1>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="secondary">{profile.position} · {positionLabels[profile.position]}</Badge>
              <Badge variant="outline">#{profile.jerseyNumber ?? "—"}</Badge>
              <Badge className="bg-emerald-400/10 text-emerald-300">{player.role === "CAPTAIN" ? "KAPTAN" : "OYUNCU"}</Badge>
            </div>
          </div>
          <p className="relative flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-zinc-500"><ShieldCheck className="size-4 text-emerald-400" />Google hesabıyla doğrulandı</p>
        </CardContent>
      </Card>
      <Card className="glass gap-0 border-0 lg:col-span-7 xl:col-span-4">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="flex items-center gap-2"><CalendarRange className="size-5 text-emerald-400" />Sezon seçici</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <SeasonPicker showLabel={false} seasons={seasons} selectedId={selected?.id ?? ""} basePath={`/profil/${player.id}`} />
          {selected && <div className="mt-5"><SeasonReadOnlyNote seasonName={selected.name} isActive={selected.isActive} /></div>}
        </CardContent>
      </Card>

      <Card className="glass gap-0 border-0 lg:col-span-12 xl:col-span-4">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><Swords className="size-5 text-emerald-400" />{selected?.name ?? "Sezon"} performansı</span>
            <LockKeyhole className="size-4 text-zinc-600" aria-hidden />
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {seasonStats.length === 0
            ? <p className="text-sm text-zinc-400">{selected?.isActive ? "Bu sezonda henüz maç raporu yok." : "Bu sezon arşivlenmiş ve istatistik yok."}</p>
            : <dl className="space-y-4">{seasonStats.map(stat => (
                <div key={stat.label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <dt className="flex items-center gap-2 text-sm text-zinc-400"><stat.icon className={`size-4 ${stat.accent ? "text-amber-300" : "text-emerald-400"}`} aria-hidden />{stat.label}</dt>
                  <dd className="font-mono text-xl font-bold tabular-nums">{stat.value}</dd>
                </div>
              ))}</dl>}
          {selectedStat && <p className="mt-4 text-xs text-zinc-500">{selectedStat.matchesPlayed} maç oynandı · genel OVR {selectedStat.ovrRating.toFixed(1)}</p>}
        </CardContent>
      </Card>

      {/* GÖREV 5: right-column match log — the same row links to the full report. */}
      <Card className="glass gap-0 border-0 lg:col-span-12 xl:col-span-4">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><CalendarDays className="size-5 text-emerald-400" />Son maçlar</span>
            <span className="text-[10px] tracking-widest text-zinc-500">GOL / ASİST</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {recentMatches.length === 0
            ? <p className="text-sm text-zinc-400">Henüz tamamlanmış maç yok.</p>
            : <ul className="divide-y divide-white/5">{recentMatches.map(row => (
                <li key={row.match.id}>
                  <Link href={`/mac/${row.match.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.match.teamAName} <span className="font-mono text-zinc-500">{row.match.teamAScore} : {row.match.teamBScore}</span> {row.match.teamBName}</p>
                      <p className="text-[11px] text-zinc-500">{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }).format(row.match.date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
                      <span className="text-emerald-300">{row.goals}G</span>
                      <span className="text-sky-300">{row.assists}A</span>
                      {row.isMotm && <Trophy className="size-3.5 text-amber-300" aria-label="Maçın adamı" />}
                    </div>
                  </Link>
                </li>
              ))}</ul>}
        </CardContent>
      </Card>

      <div className="lg:col-span-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Kariyer istatistikleri</h2>
          <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-zinc-500 uppercase"><LockKeyhole className="size-3" />Salt okunur</span>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile label="Oynanan maç" value={profile.matchesPlayed} icon={Swords} />
          <StatTile label="Gol" value={profile.goals} icon={Target} />
          <StatTile label="Asist" value={profile.assists} icon={Medal} />
          <StatTile label="Maçın adamı" value={profile.motmCount} icon={Trophy} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">Genel OVR ve kariyer istatistikleri bu sayfadan değiştirilemez. Gol, asist, maç ve MOTM değerleri onaylanan maç raporlarından güncellenir.</p>
      </div>

      <Card className="glass gap-0 border-0 lg:col-span-12">
        <CardContent className="p-0">
          <RatingSummary scores={summary.scores} count={summary.count} ovr={summary.ovr} crewName={activeCrewName} />
        </CardContent>
      </Card>

      {isSelf && (
        <Card className="glass gap-0 border-amber-400/15 py-0 lg:col-span-12">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Crown className="size-5 text-amber-300" />Kişisel bilgilerini düzenle</h2>
              <p className="mt-1 text-sm text-zinc-400">İsim, telefon, forma numarası ve ana mevki değiştirilebilir.</p>
            </div>
            <Button asChild variant="outline"><Link href="/profil">Profili aç</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  </div>;
}