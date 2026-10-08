import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Crown, LockKeyhole, Medal, ShieldCheck, Swords, Target, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSeasons, getSeasonStat } from "@/lib/season-data";
import { SeasonPicker, SeasonReadOnlyNote } from "@/components/season-picker";
import { PlayerCard } from "@/components/player-card";
import { ProfileForm, CaptainForm } from "@/components/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrewRatingSummary } from "@/lib/rating-data";
import { getActiveCrewContext } from "@/lib/active-crew";
import { RatingSummary } from "@/components/rating-summary";

export const metadata: Metadata = { title: "Oyuncu Profilim" };

/** Read-only tile: plain markup only, so the number cannot be edited in the UI. */
function StatTile({ label, value, icon: Icon, accent = false }: { label: string; value: number; icon: typeof Swords; accent?: boolean }) {
  return <div className="glass p-5">
    <div className="flex items-start justify-between">
      <Icon className={`size-5 ${accent ? "text-amber-300" : "text-emerald-400"}`} aria-hidden />
      <LockKeyhole className="size-3 text-zinc-700" aria-hidden />
    </div>
    <p className="mt-4 font-mono text-3xl font-bold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-zinc-400">{label}</p>
  </div>;
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const [sessionUser, { season: requestedSeason }] = await Promise.all([requireUser(), searchParams]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id }, include: { playerProfile: true } });
  const profile = user.playerProfile;
  // Attribute stats are the ACTIVE crew's verdict (read-only on this page).
  const [workspace, seasons] = await Promise.all([getActiveCrewContext(sessionUser.id), listSeasons()]);
  const summary = profile ? await getCrewRatingSummary(workspace.activeCrewId, sessionUser.id) : null;
  const activeCrewName = workspace.crews.find((crew) => crew.id === workspace.activeCrewId)?.name ?? null;
  // Default to the requested season, then the live one.
  const selectedSeason = seasons.find(season => season.id === requestedSeason) ?? seasons.find(season => season.isActive) ?? seasons[0] ?? null;
  const seasonStat = profile && selectedSeason ? await getSeasonStat(profile.id, selectedSeason.id) : null;

  const seasonStats = seasonStat
    ? [
        { label: "OVR", value: Math.round(seasonStat.ovrRating), icon: Swords, accent: true },
        { label: "Gol", value: seasonStat.goals, icon: Target },
        { label: "Asist", value: seasonStat.assists, icon: Medal },
        { label: "Maçın adamı", value: seasonStat.motmCount, icon: Trophy },
      ]
    : [];

  const stats = [{ label: "Oynanan maç", value: profile?.matchesPlayed ?? 0, icon: Swords }, { label: "Gol", value: profile?.goals ?? 0, icon: Target }, { label: "Asist", value: profile?.assists ?? 0, icon: Medal }, { label: "Maçın adamı", value: profile?.motmCount ?? 0, icon: Trophy }];

  return <div className="space-y-8">
    <div><p className="eyebrow">PLAYER IDENTITY</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Sahadaki kimliğin.</h1><p className="mt-2 text-sm text-zinc-400">Profilini özelleştir. Performansın senin adına konuşsun.</p></div>

    {/* Bento grid: 12 columns on desktop, each tile spanning a deliberate size. */}
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 [&>*]:min-w-0">
      <Card className="glass relative gap-0 overflow-hidden border-0 py-0 lg:col-span-5 xl:col-span-4">
        <CardContent className="flex flex-col items-center gap-6 p-6 text-center">
          <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
          <PlayerCard name={user.name || "Oyuncu"} image={user.image} position={profile?.position ?? "MID"} ovr={summary?.ovr ?? null} jerseyNumber={profile?.jerseyNumber} captain={user.role === "CAPTAIN"} scores={summary?.scores ?? null} ratingCount={summary?.count ?? 0} className="relative mx-auto" />
          <div className="relative space-y-3">
            <h2 className="text-2xl font-bold">{user.name || "Oyuncu"}</h2>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="secondary">{profile?.position ?? "MID"}</Badge>
              <Badge variant="outline">#{profile?.jerseyNumber ?? "—"}</Badge>
              <Badge className="bg-emerald-400/10 text-emerald-300">{user.role === "CAPTAIN" ? "KAPTAN" : "OYUNCU"}</Badge>
            </div>
          </div>
          <p className="relative flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-zinc-500"><ShieldCheck className="size-4 text-emerald-400" />Google hesabıyla doğrulandı</p>
        </CardContent>
      </Card>
      <Card className="glass gap-0 border-0 py-0 lg:col-span-7 xl:col-span-8">
        <CardHeader className="px-6 pt-6 sm:px-8">
          <CardTitle className="text-lg">Kişisel bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
          <ProfileForm profile={{ name: user.name || "", phone: user.phone || "", jerseyNumber: profile?.jerseyNumber ?? null, position: profile?.position ?? "MID" }} />
          <p className="mt-5 border-t border-white/10 pt-4 text-xs text-zinc-500">
            Yalnızca isim, telefon, forma numarası ve ana mevki güncellenebilir. OVR, gol, asist, maç ve MOTM değerleri bu form aracılığıyla değiştirilemez.
          </p>
        </CardContent>
      </Card>

      <Card className="glass gap-0 border-0 py-0 lg:col-span-5 xl:col-span-4">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="size-5 text-emerald-400" />Sezon performansı</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <SeasonPicker showLabel={false} seasons={seasons} selectedId={selectedSeason?.id ?? ""} basePath="/profil" />
          <div className="mt-5">
            {seasonStats.length === 0
              ? <p className="text-sm text-zinc-400">Bu sezonda henüz maç raporu yok.</p>
              : <dl className="space-y-3">{seasonStats.map(stat => (
                  <div key={stat.label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <dt className="flex items-center gap-2 text-sm text-zinc-400"><stat.icon className={`size-4 ${stat.accent ? "text-amber-300" : "text-emerald-400"}`} aria-hidden />{stat.label}</dt>
                    <dd className="font-mono text-lg font-bold tabular-nums">{stat.value}</dd>
                  </div>
                ))}</dl>}
            {seasonStat && <p className="mt-4 text-xs text-zinc-500">{seasonStat.matchesPlayed} maç oynandı</p>}
          </div>
          {selectedSeason && <div className="mt-4"><SeasonReadOnlyNote seasonName={selectedSeason.name} isActive={selectedSeason.isActive} /></div>}
          <p className="mt-4 border-t border-white/10 pt-4 text-xs text-zinc-500">
            Geçmiş sezon istatistikleri ve herkese açık profil için <Link href={`/profil/${sessionUser.id}`} className="text-emerald-300 hover:text-emerald-200">profil sayfasına</Link> bak.
          </p>
        </CardContent>
      </Card>

      <div className="lg:col-span-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Kariyer istatistikleri</h2>
          <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-zinc-500 uppercase"><LockKeyhole className="size-3" />Salt okunur</span>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map(stat => <StatTile key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />)}
        </div>
        <p className="mt-3 text-xs text-zinc-500">OVR ve kariyer istatistikleri bu sayfadan değiştirilemez. Gol, asist, maç ve MOTM değerleri onaylanan raporlardan güncellenir.</p>
      </div>

      <Card className="glass gap-0 border-amber-400/15 py-0 lg:col-span-12">
        <CardContent className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-semibold"><Crown className="size-5 text-amber-300" />{user.role === "CAPTAIN" ? "Kaptanlık yetkin aktif" : "Oyunu yöneten sen ol"}</h2>
          <p className="max-w-2xl text-sm text-zinc-400">Kaptanlar maç oluşturabilir, takımları düzenleyebilir ve kendi maçlarının sonuçlarını onaylayabilir.</p>
          {user.role !== "CAPTAIN" && <CaptainForm />}
        </CardContent>
      </Card>

      {summary && (
        <div className="lg:col-span-12">
          <RatingSummary scores={summary.scores} count={summary.count} ovr={summary.ovr} crewName={activeCrewName} />
        </div>
      )}
    </div>
  </div>;
}