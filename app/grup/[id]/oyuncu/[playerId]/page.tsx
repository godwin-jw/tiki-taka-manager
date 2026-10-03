import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireGroupMember } from "@/lib/legacy";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";

export default async function LegacyPlayer({ params }: { params: Promise<{ id: string; playerId: string }> }) {
  const { id, playerId } = await params;
  await requireGroupMember(id);
  const p = await prisma.groupPlayerProfile.findFirst({ where: { id: playerId, groupId: id }, select: { ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true, pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true, user: { select: { name: true, image: true } } } });
  if (!p) notFound();
  return <div className="space-y-6"><Link href={`/grup/${id}`} className="text-sm text-zinc-400">← Grup arşivine dön</Link><section className="glass flex items-center gap-5 p-8"><PlayerAvatar name={p.user.name || "Oyuncu"} image={p.user.image} className="size-20" /><div className="flex-1"><p className="eyebrow">ARŞİV · SALT OKUNUR</p><h1 className="mt-2 text-2xl font-bold">{p.user.name}</h1></div><OvrBadge value={p.ovrRating} /></section><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Object.entries({ Maç: p.matchesPlayed, Gol: p.goals, Asist: p.assists, MOTM: p.motmCount, Hız: p.pace, Şut: p.shooting, Pas: p.passing, Dripling: p.dribbling, Defans: p.defending, Fizik: p.physical }).map(([label, value]) => <div key={label} className="glass p-5"><p className="text-xs text-zinc-400">{label}</p><p className="mt-3 font-mono text-2xl">{Math.round(value)}</p></div>)}</div></div>;
}