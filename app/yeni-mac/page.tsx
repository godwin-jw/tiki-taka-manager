import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Crown, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveCrewContext } from "@/lib/active-crew";
import { getCrewRoster } from "@/lib/data";
import { canManageCrew } from "@/lib/football";
import { MatchBuilder } from "@/components/match-builder";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Yeni Maç" };

export default async function NewMatchPage() {
  const user = await requireUser();
  // Matches are crew-only: the workspace cookie decides which crew this page
  // builds for, and the server resolves it against the viewer's own memberships.
  const { activeCrewId, crews } = await getActiveCrewContext(user.id);
  if (!activeCrewId) {
    return (
      <section className="glass mx-auto max-w-xl space-y-5 p-10">
        <Lock className="size-10 text-emerald-400" />
        <h1 className="text-2xl font-bold">Önce bir ekibe katıl.</h1>
        <p className="text-zinc-400">Maçlar bir ekibin arşivine işlenir. Aktif bir ekipte değilsen ekip merkezinden bir ekibe katılabilirsin.</p>
        <Button asChild><Link href="/ekipler">Ekiplere git</Link></Button>
      </section>
    );
  }
  const active = crews.find((crew) => crew.id === activeCrewId)!;
  // Platform captains and crew officers (OWNER / CAPTAIN / CO_CAPTAIN) may build;
  // createGlobalMatch re-checks the same rule on save.
  if (user.role !== "CAPTAIN" && !canManageCrew(active.role)) {
    return (
      <section className="glass mx-auto max-w-xl space-y-5 p-10">
        <Crown className="size-10 text-amber-300" />
        <h1 className="text-2xl font-bold">Takımının kaptanı ol.</h1>
        <p className="text-zinc-400">Maç oluşturmak için profilinden kaptanlık yetkisini etkinleştirebilir veya ekibinde kaptan/yardımcısı olabilirsin.</p>
        <Button asChild><Link href="/profil">Profilime git</Link></Button>
      </section>
    );
  }
  // Crew-scoped pool: only this crew's members, with this crew's contextual OVR.
  const crewRoster = await getCrewRoster(activeCrewId);
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">MATCH CENTER / SNAKE DRAFT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Dengeli takımlar. Gerçek rekabet.</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">Kaleciler karşılıklı dağıtılır; kalan oyuncular OVR sırasına göre A–B–B–A düzeniyle seçilir. Son söz kaptanda.</p>
      </div>
      <MatchBuilder requestId={randomUUID()} crewId={activeCrewId} crewName={active.name} crewRoster={crewRoster} />
    </div>
  );
}