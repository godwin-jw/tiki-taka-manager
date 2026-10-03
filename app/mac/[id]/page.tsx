import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCheck, ClipboardList, Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TacticalPitch } from "@/components/tactical-pitch";
import { Button } from "@/components/ui/button";
import type { DraftPlayer } from "@/lib/football";

export const metadata = { title: "Maç Merkezi" };
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const match = await prisma.match.findUnique({ where: { id, groupId: null }, include: { createdBy: { select: { name: true } }, players: { include: { playerProfile: { select: { userId: true, user: { select: { name: true, image: true } } } } }, orderBy: { id: "asc" } } } });
  if (!match) notFound();
  const players: DraftPlayer[] = match.players.map(p => ({ id: p.playerProfileId, userId: p.playerProfile.userId, name: p.playerProfile.user.name || "Oyuncu", image: p.playerProfile.user.image, position: p.position, team: p.team, ovrRating: p.ovrAtMatch, form: [] }));
  const completed = match.status === "COMPLETED";
  return <div className="space-y-7"><Link href="/" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white"><ArrowLeft className="size-3" />Kulüp merkezine dön</Link><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">MATCH CENTER</p><h1 className="mt-2 text-3xl font-bold break-words">{match.teamAName} <span className="text-zinc-600">vs</span> {match.teamBName}</h1><p className="mt-2 text-xs text-zinc-400">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(match.date)} · İstanbul saati · Kaptan: {match.createdBy?.name || "Oyuncu"}</p></div>{!completed && match.status === "ONGOING" && user.id === match.createdById && user.role === "CAPTAIN" && <Button asChild><Link href={`/mac/${id}/rapor`}><ClipboardList />Maç raporunu gir</Link></Button>}</div>
    <section className="glass space-y-3 p-8 text-center"><p className="flex items-center justify-center gap-2 text-xs text-emerald-300">{completed ? <><CheckCheck className="size-4" />RAPOR ONAYLANDI</> : "MAÇ KADROSU HAZIR"}</p><p className="font-mono text-6xl font-black">{completed ? `${match.teamAScore} : ${match.teamBScore}` : "— : —"}</p>{completed && <p className="text-xs text-zinc-500">İstatistikler oyuncu profillerine işlendi.</p>}</section>
    <TacticalPitch players={players} teamAName={match.teamAName} teamBName={match.teamBName} />
    {completed && <section className="glass overflow-hidden"><h2 className="border-b border-white/10 p-5 font-semibold">Maç istatistikleri</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-zinc-500"><tr><th className="p-4">Oyuncu</th><th className="p-4">Takım</th><th className="p-4">Gol</th><th className="p-4">Asist</th><th className="p-4">MOTM</th></tr></thead><tbody>{match.players.map(p => <tr key={p.id} className="border-t border-white/5"><td className="p-4">{p.playerProfile.user.name}</td><td className="p-4">{p.team}</td><td className="p-4 font-mono">{p.goals}</td><td className="p-4 font-mono">{p.assists}</td><td className="p-4">{p.isMotm ? <Star className="size-4 text-amber-300" aria-label="Maçın adamı" /> : "—"}</td></tr>)}</tbody></table></div></section>}
  </div>;
}