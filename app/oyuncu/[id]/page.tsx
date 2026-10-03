import Link from "next/link";
import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRatingSummary } from "@/lib/rating-data";
import { RatingSummary } from "@/components/rating-summary";
import { RatingForm } from "@/components/rating-form";
import { PlayerCard } from "@/components/player-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { positionLabels } from "@/lib/football";

export const metadata = { title: "Oyuncu Profili" };
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // Public fields only. Do not expose another player's phone/email or individual votes.
  const player = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, image: true, role: true, playerProfile: { select: { id: true, position: true, jerseyNumber: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true } } } });
  if (!player?.playerProfile) notFound();
  const profile = player.playerProfile;
  const isSelf = player.id === user.id;
  const [summary, myRating] = await Promise.all([
    getRatingSummary(profile.id),
    prisma.playerRating.findUnique({ where: { raterId_playerProfileId: { raterId: user.id, playerProfileId: profile.id } }, select: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true } }),
  ]);
  const career: Array<[string, number]> = [["Maç", profile.matchesPlayed], ["Gol", profile.goals], ["Asist", profile.assists], ["MOTM", profile.motmCount]];
  return <div className="space-y-6"><Link href="/" className="text-xs text-zinc-400 hover:text-white">← Kulüp merkezine dön</Link>
    <section className="glass grid gap-8 p-6 sm:p-8 lg:grid-cols-[19rem_1fr] lg:items-center">
      <PlayerCard name={player.name || "Oyuncu"} image={player.image} position={profile.position} ovr={profile.ovrRating} jerseyNumber={profile.jerseyNumber} captain={player.role === "CAPTAIN"} scores={summary.scores} ratingCount={summary.count} className="mx-auto" />
      <div className="min-w-0 space-y-6">
        <div><p className="eyebrow">GLOBAL PLAYER PROFILE</p><h1 className="mt-2 break-words text-3xl font-bold">{player.name || "Oyuncu"}</h1><div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">{profile.position} · {positionLabels[profile.position]}</Badge><Badge variant="outline">#{profile.jerseyNumber ?? "—"}</Badge><Badge variant="outline">{player.role === "CAPTAIN" ? "Kaptan" : "Oyuncu"}</Badge></div></div>
        <p className="max-w-xl text-sm leading-6 text-zinc-400">Ultimate Team kartı, topluluğun verdiği oyların ortalamasını canlı yansıtır. Rozetteki OVR altı futbol özelliğinin ortalamasıdır; kariyer verileri onaylanan maç raporlarından güncellenir.</p>
        <section aria-label="Kariyer istatistikleri" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{career.map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-1 font-mono text-2xl font-bold">{value}</p></div>)}</section>
      </div>
    </section>
    <RatingSummary {...summary} ovr={profile.ovrRating} />
    {isSelf ? <section className="glass space-y-4 p-6"><p className="flex items-center gap-2 text-sm text-zinc-400"><LockKeyhole className="size-4" />Kendini değerlendiremezsin. OVR puanın diğer oyuncuların değerlendirmelerinden oluşur.</p><Button asChild variant="outline"><Link href="/profil">Kişisel bilgilerimi düzenle</Link></Button></section> : <RatingForm key={profile.id} playerProfileId={profile.id} initialScores={myRating} />}
  </div>;
}