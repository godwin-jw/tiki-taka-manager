import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveCrewContext } from "@/lib/active-crew";
import { getCrewRatingSummary } from "@/lib/rating-data";
import { RatingSummary } from "@/components/rating-summary";
import { CrewVoteMenu } from "@/components/crew-forms";
import { PlayerCard } from "@/components/player-card";
import { Badge } from "@/components/ui/badge";
import { positionLabels } from "@/lib/football";

export const metadata = { title: "Oyuncu Kartı" };

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [player, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: {
      id: true, name: true, image: true, role: true,
      playerProfile: { select: { position: true, jerseyNumber: true, goals: true, assists: true, matchesPlayed: true, motmCount: true } },
    } }),
    getActiveCrewContext(user.id),
  ]);
  if (!player?.playerProfile) notFound();
  const profile = player.playerProfile;
  const crewId = workspace.activeCrewId;
  const [summary, membership, myVote] = await Promise.all([
    getCrewRatingSummary(crewId, player.id),
    crewId ? prisma.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: player.id } }, select: { id: true } }) : null,
    crewId && player.id !== user.id ? prisma.playerRatingVote.findUnique({
      where: { crewId_voterId_targetUserId: { crewId, voterId: user.id, targetUserId: player.id } },
      select: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true },
    }) : null,
  ]);
  const crewName = workspace.crews.find(crew => crew.id === crewId)?.name;
  const career: Array<[string, number]> = [["Maç", profile.matchesPlayed], ["Gol", profile.goals], ["Asist", profile.assists], ["MOTM", profile.motmCount]];

  return <div className="space-y-6">
    <Link href="/" className="text-xs text-zinc-400 hover:text-white">← Kulüp merkezine dön</Link>
    <section className="glass grid gap-8 p-6 sm:p-8 lg:grid-cols-[19rem_1fr] lg:items-center">
      <PlayerCard name={player.name || "Oyuncu"} image={player.image} position={profile.position} ovr={summary.ovr} jerseyNumber={profile.jerseyNumber} captain={player.role === "CAPTAIN"} scores={summary.scores} ratingCount={summary.count} className="mx-auto" />
      <div className="min-w-0 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="eyebrow">OYUNCU KARTI</p><h1 className="mt-2 break-words text-3xl font-bold">{player.name || "Oyuncu"}</h1><Badge variant="secondary" className="mt-3">{profile.position} · {positionLabels[profile.position]}</Badge></div>
          {crewId && membership && player.id !== user.id && <CrewVoteMenu crewId={crewId} targetUserId={player.id} name={player.name || "Oyuncu"} image={player.image} existingVote={myVote} fallbackScores={summary.count ? summary.scores : null} />}
        </div>
        <p className="text-sm leading-6 text-zinc-400">Altı özellik ve OVR{crewName ? ` ${crewName} ekibinin` : " aktif ekibin"} oylarından hesaplanır. Kariyer verileri onaylanan maç raporlarından güncellenir.</p>
        <section aria-label="Kariyer istatistikleri" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{career.map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-mono text-2xl font-bold">{value}</p></div>)}</section>
        <Link href={`/profil/${player.id}`} className="text-sm text-emerald-300 hover:text-emerald-200">Kariyer profilini görüntüle</Link>
        {player.id === user.id ? <p className="text-sm text-zinc-400">Kendine oy veremezsin.</p> : !membership && <p className="text-sm text-zinc-400">Yalnızca aktif ekibindeki oyunculara oy verebilirsin.</p>}
      </div>
    </section>
    <RatingSummary {...summary} crewName={crewName} />
  </div>;
}
