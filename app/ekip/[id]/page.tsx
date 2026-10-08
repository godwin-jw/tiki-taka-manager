import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Lock, Shield, Swords, Target, Trophy, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveCrewContext } from "@/lib/active-crew";
import { getCrewDetail } from "@/lib/crew-service";
import { prisma } from "@/lib/prisma";
import { listIncomingInvitations } from "@/lib/invitation-service";
import { BackToCrewsLink, CancelRequestButton, CrewInviteLink, CrewRequestsPanel, IncomingInvitationsPanel, InvitePlayerDialog, JoinCrewForm, JoinSuccessToast, LeaveCrewButton, RosterMemberMenu } from "@/components/crew-forms";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";
import { Badge } from "@/components/ui/badge";
import { positionLabels, sortByStats } from "@/lib/football";

export const metadata: Metadata = { title: "Ekip" };

const roleLabels = { OWNER: "Kurucu", CAPTAIN: "Kaptan", CO_CAPTAIN: "Kaptan Yardımcısı", MEMBER: "Üye" } as const;

function Leaderboard({ title, icon: Icon, rows, metric }: {
  title: string;
  icon: typeof Trophy;
  rows: Array<{ userId: string; name: string; image: string | null; position: string; ovrRating: number; isUnrated?: boolean; goals: number; assists: number; motmCount: number }>;
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
          {/* An unrated player has only a seed value in this crew, so the OVR card
              says so instead of presenting 75 as a verdict. */}
          <span className="shrink-0 font-mono text-sm font-bold text-emerald-300">{metric === "ovrRating" && row.isUnrated ? "—" : Math.round(row[metric])}</span>
        </Link>
      </li>
    ))}</ol>
  </section>;
}

export default async function CrewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ katildi?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [{ katildi }, crew, invitations, workspace] = await Promise.all([
    searchParams,
    getCrewDetail(id, user.id),
    listIncomingInvitations(prisma, user.id),
    getActiveCrewContext(user.id),
  ]);
  if (!crew) notFound();
  const justJoined = katildi === "1";

  return <div className="space-y-6">
    <BackToCrewsLink />
    <JoinSuccessToast joined={justJoined} crewName={crew.name} />
    {invitations.length > 0 && <IncomingInvitationsPanel invitations={invitations.map(entry => ({
      id: entry.id,
      createdAt: entry.createdAt,
      crew: { id: entry.crew.id, name: entry.crew.name, logo: entry.crew.logo, memberCount: entry.crew._count.members },
      sender: { id: entry.sender.id, name: entry.sender.name, image: entry.sender.image },
    }))} />}

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

    {crew.isManager && <>
      <CrewInviteLink inviteCode={crew.inviteCode} crewName={crew.name} />
      <div className="flex justify-end">
        <InvitePlayerDialog crewId={crew.id} />
      </div>
      <CrewRequestsPanel crewId={crew.id} requests={crew.pendingRequests} />
    </>}

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
                <OvrBadge value={member.ovrRating} isUnrated={member.isUnrated} voteCount={member.voteCount} />
              </Link>
              {/* One menu per row: vote / promote / kick, each gated by the same
                  rules the server enforces (GÖREV 1 + GÖREV 4). */}
              <RosterMemberMenu
                crewId={crew.id}
                member={{
                  userId: member.userId,
                  name: member.name,
                  image: member.image,
                  role: member.role,
                  hasProfile: member.hasProfile,
                  scores: member.scores,
                  viewerScores: member.viewerScores,
                }}
                viewerId={user.id}
                isManager={crew.isManager}
                isOwner={crew.isOwner}
                isActiveCrew={workspace.activeCrewId === crew.id}
              />
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