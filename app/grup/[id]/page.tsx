import Link from "next/link";
import { Archive, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireGroupMember } from "@/lib/legacy";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";

export default async function GroupArchive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await requireGroupMember(id);
  const [players, matches] = await Promise.all([
    prisma.groupPlayerProfile.findMany({ where: { groupId: id }, select: { id: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, user: { select: { name: true, image: true } } }, orderBy: { ovrRating: "desc" } }),
    prisma.match.findMany({ where: { groupId: id }, orderBy: { date: "desc" }, take: 50, select: { id: true, date: true, status: true, teamAScore: true, teamBScore: true } }),
  ]);
  return <div className="space-y-7"><div><p className="eyebrow">LEGACY CLUB ARCHIVE</p><h1 className="mt-2 text-3xl font-bold">{group.name}</h1></div><section className="glass space-y-4 p-6"><Archive className="size-6 text-amber-300" /><p className="text-sm leading-6 text-zinc-400">Grup kayıtların korunuyor. Çift istatistik yazımını önlemek için bu alan artık salt okunur arşivdir. Yeni maçlar global havuzdan oluşturulur; eski açık maçlar otomatik sonuçlandırılmaz.</p><Button asChild><Link href="/yeni-mac">Global maç oluştur<ArrowUpRight /></Link></Button></section><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{players.map(p => <Link key={p.id} href={`/grup/${id}/oyuncu/${p.id}`} className="glass flex items-center gap-3 p-5 transition-colors hover:border-emerald-400/30"><PlayerAvatar name={p.user.name || "Oyuncu"} image={p.user.image} /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{p.user.name}</h2><p className="mt-1 text-xs text-zinc-500">{p.matchesPlayed} maç · {p.goals} gol · {p.assists} asist</p></div><OvrBadge value={p.ovrRating} /></Link>)}</div><section className="glass p-6"><h2 className="mb-4 font-semibold">Eski maçlar · son 50</h2>{!matches.length && <p className="text-sm text-zinc-500">Kayıtlı maç yok.</p>}<div className="divide-y divide-white/5">{matches.map(m => <div key={m.id} className="flex items-center justify-between gap-4 py-4"><p className="text-xs text-zinc-400">{m.date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</p><span className="font-mono">{m.teamAScore} : {m.teamBScore}</span><span className="text-[10px] text-zinc-500">{m.status === "COMPLETED" ? "TAMAMLANDI" : m.status === "CANCELLED" ? "İPTAL" : "ESKİ AÇIK KAYIT"}</span></div>)}</div></section></div>;
}