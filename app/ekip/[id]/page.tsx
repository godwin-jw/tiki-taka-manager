import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Lock, Shield, Swords, Target, Trophy, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCrewDetail } from "@/lib/crew-service";
import { BackToCrewsLink, CancelRequestButton, CrewRequestsPanel, JoinCrewForm, LeaveCrewButton, PeerVoteButton } from "@/components/crew-forms";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";
import { Badge } from "@/components/ui/badge";
import { positionLabels, sortByStats } from "@/lib/football";

export const metadata: Metadata = { title: "Ekip" };

const roleLabels = { OWNER: "Kurucu", CAPTAIN: "Kaptan", MEMBER: "Üye" } as const;

function Leaderboard({ title, icon: Icon, rows, metric }: {
  title: string;
  icon: typeof Trophy;
  rows: Array<{ userId: string; name: string; image: string | null; position: string; ovrRating: number; goals: number; assists: number; motmCount: number }>;
  metric: "ovrRating" | "goals" | "assists" | "motmCount";
}) {
  // Sorted by the requested metric, then OVR, then name for a stable order.
  const ordered = sortByStats(rows, metric);
  return <section className="glass p-5">
    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-emerald-400" />{title}</h2>
    <ol className="space-y-1">{ordered.map((row, index) => (
      <li key={row.userId}>
        <Link href={`/oyuncu/${row.userId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5">
          <span className="w-5 shrink-0 font-mono text-xs text-zinc-500">{index + 1}</span>
          <PlayerAvatar name={row.name} image={row.image} className="size-8" />
          <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
          <span className="shrink-0 font-mono text-sm font-bold text-emerald-300">{Math.round(row[metric])}</span>
        </Link>
      </li>
    ))}</ol>
  </section>;
}

export default async function CrewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const crew = await getCrewDetail(id, user.id);
  if (!crew) notFound();

  return <div className="space-y-6">
    <BackToCrewsLink />

    <section className="glass flex flex-wrap items-start justify-between gap-6 p-6 sm:p-8">
      <div className="min-w-0">
        <p className="eyebrow">PRO CLUBS</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{crew.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary"><Crown className="mr-1 size-3" />Kaptan: {crew.ownerName}</Badge>
          <Badge variant="outline">{crew.memberCount} / {crew.memberLimit} üye</Badge>
          {crew.isMember && <Badge className="bg-emerald-400/10 text-emerald-300">{roleLabels[crew.membershipRole ?? "MEMBER"]}</Badge>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-3">
        {crew.isOwner ? <p className="text-xs text-zinc-500">Ekip sahibi ekipten ayrılamaz.</p>
          : crew.isMember ? <LeaveCrewButton crewId={crew.id} />
          : crew.viewerRequestStatus === "PENDING" ? <div className="w-64 space-y-2"><p className="text-right text-xs text-amber-300">İsteğin kaptanın onayını bekliyor.</p><CancelRequestButton crewId={crew.id} /></div>
          : <div className="w-64"><JoinCrewForm crewId={crew.id} /></div>}
      </div>
    </section>

    {crew.isManager && <CrewRequestsPanel crewId={crew.id} requests={crew.pendingRequests} />}

    {crew.isMember ? (
      <>
        <section aria-label="Ekip kadrosu" className="glass p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Users className="size-5 text-emerald-400" />Ekip kadrosu</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{crew.roster.map(member => (
            <li key={member.memberId} className="flex items-center gap-2">
              <Link href={`/oyuncu/${member.userId}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-emerald-400/30">
                <PlayerAvatar name={member.name} image={member.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="text-xs text-zinc-500">{positionLabels[member.position]} · {roleLabels[member.role]}</p>
                </div>
                <OvrBadge value={member.ovrRating} />
              </Link>
              {/* Self-voting is blocked server-side, so the button is simply not offered. */}
              {member.userId !== user.id && (
                <PeerVoteButton
                  crewId={crew.id}
                  targetUserId={member.userId}
                  name={member.name}
                  image={member.image}
                  currentOvr={member.ovrRating}
                  existingVote={member.viewerVote}
                />
              )}
            </li>
          ))}</ul>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Leaderboard title="OVR Liderliği" icon={Swords} rows={crew.roster} metric="ovrRating" />
          <Leaderboard title="Gol Krallığı" icon={Target} rows={crew.roster} metric="goals" />
          <Leaderboard title="Asist Krallığı" icon={Trophy} rows={crew.roster} metric="assists" />
          <Leaderboard title="En Çok MOTM" icon={Crown} rows={crew.roster} metric="motmCount" />
        </div>
      </>
    ) : (
      <section className="glass flex items-center gap-3 p-6 text-sm text-zinc-400">
        <Lock className="size-4 text-zinc-600" />
        Ekip kadrosu ve liderlik tabloları yalnızca üyeler tarafından görüntülenebilir. Katılma isteği göndererek ekibe dahil ol.
      </section>
    )}

    <p className="flex items-center gap-2 text-xs text-zinc-500"><Shield className="size-3 text-emerald-400" />Tablo yalnızca bu ekibin üyelerini kapsar; istatistikler onaylanan maç raporlarından gelir.</p>
    <span className="sr-only">Ekip sayfan</span>
  </div>;
}