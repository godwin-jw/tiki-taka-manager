import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Crown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCrewsOfUser } from "@/lib/crew-service";
import { MatchBuilder } from "@/components/match-builder";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Yeni Maç" };
export default async function NewMatchPage() {
  const user = await requireUser();
  if (user.role !== "CAPTAIN") return <section className="glass mx-auto max-w-xl space-y-5 p-10"><Crown className="size-10 text-amber-300" /><h1 className="text-2xl font-bold">Takımının kaptanı ol.</h1><p className="text-zinc-400">Maç oluşturmak için profilinden kaptanlık yetkisini etkinleştirebilirsin.</p><Button asChild><Link href="/profil">Profilime git</Link></Button></section>;
  // Only crews the captain actually belongs to, so the picker can never offer a
  // crew they could not post to (the service re-checks this regardless).
  const crews = await getCrewsOfUser(user.id);
  return <div className="space-y-8"><div><p className="eyebrow">MATCH CENTER / SNAKE DRAFT</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Dengeli takımlar. Gerçek rekabet.</h1><p className="mt-3 max-w-2xl text-sm text-zinc-400">Kaleciler karşılıklı dağıtılır; kalan oyuncular OVR sırasına göre A–B–B–A düzeniyle seçilir. Son söz kaptanda.</p></div><MatchBuilder requestId={randomUUID()} crews={crews} /></div>;
}