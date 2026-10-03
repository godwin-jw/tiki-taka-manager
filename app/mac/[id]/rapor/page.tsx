import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportForm } from "@/components/report-form";

export const metadata = { title: "Maç Sonu Raporu" };
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const match = await prisma.match.findUnique({ where: { id, groupId: null }, include: { players: { include: { playerProfile: { select: { user: { select: { name: true, image: true } } } } }, orderBy: { id: "asc" } } } });
  if (!match) notFound();
  if (match.createdById !== user.id || user.role !== "CAPTAIN" || match.status !== "ONGOING") redirect(`/mac/${id}`);
  return <div className="space-y-8"><div><Link href={`/mac/${id}`} className="text-xs text-zinc-400 hover:text-white">← Maça dön</Link><p className="eyebrow mt-6">FINAL WHISTLE</p><h1 className="mt-2 text-3xl font-bold">Sahadaki hikâyeyi kaydet.</h1><p className="mt-3 text-sm text-zinc-400">Skor, gol, asist ve maçın adamı. Tek onay, tüm kariyerlere yansır.</p></div><ReportForm matchId={id} players={match.players.map(p => ({ id: p.playerProfileId, name: p.playerProfile.user.name || "Oyuncu", image: p.playerProfile.user.image, team: p.team }))} /></div>;
}