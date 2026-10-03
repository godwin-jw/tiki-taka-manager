import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Shield, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCrewsOfUser, listCrews } from "@/lib/crew-service";
import { CreateCrewForm, CrewSearchForm } from "@/components/crew-forms";
import { PlayerAvatar } from "@/components/player-avatar";

export const metadata: Metadata = { title: "Ekipler" };

export default async function CrewsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const [crews, myCrews] = await Promise.all([listCrews(q), getCrewsOfUser(user.id)]);
  const myIds = new Set(myCrews.map(crew => crew.id));

  return <div className="space-y-8">
    <div><p className="eyebrow">PRO CLUBS</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Ekipleri keşfet.</h1><p className="mt-2 text-sm text-zinc-400">Kendi ekibini kur, kadronu birlikte yönet ve ekip içi liderlik tablosunda yüksel.</p></div>

    {myCrews.length > 0 && <nav aria-label="Ekiplerim" className="flex flex-wrap gap-2">
      {myCrews.map(crew => <Link key={crew.id} href={`/ekip/${crew.id}`} className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-400/15">
        <Crown className="size-4" />{crew.name}<span className="text-xs text-emerald-400/70">{crew._count.members} üye</span>
      </Link>)}
    </nav>}

    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <section aria-label="Ekipler" className="space-y-4">
        <CrewSearchForm query={q ?? ""} />
        {crews.length === 0
          ? <div className="glass p-10 text-center"><Users className="mx-auto mb-3 size-7 text-zinc-600" /><p className="text-sm text-zinc-400">{q ? `"${q}" için ekip bulunamadı.` : "Henüz ekip yok. İlk ekibi sen kur."}</p></div>
          : <ul className="grid gap-4 sm:grid-cols-2">{crews.map(crew => <li key={crew.id}>
            <Link href={`/ekip/${crew.id}`} className="glass flex h-full flex-col gap-4 p-5 transition-colors hover:border-emerald-400/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate font-semibold">{crew.name}</h2><p className="mt-1 text-xs text-zinc-500">Kaptan: {crew.ownerName}</p></div>
                {myIds.has(crew.id) && <span className="shrink-0 rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">ÜYESİN</span>}
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><Users className="size-3.5" />{crew.memberCount} üye</span>
                {crew.pendingCount > 0 && <span className="flex items-center gap-1.5 text-amber-300"><Shield className="size-3.5" />{crew.pendingCount} istek</span>}
              </div>
            </Link>
          </li>)}</ul>}
      </section>

      <aside className="glass space-y-4 p-6">
        <h2 className="font-semibold">Yeni ekip kur</h2>
        <CreateCrewForm />
        <div className="flex items-start gap-2 border-t border-white/10 pt-4 text-[11px] text-zinc-500"><PlayerAvatar name={user.name || "Oyuncu"} image={user.image} className="size-8" /><p>Kurduğun ekibin kaptanısın; katılma isteklerini yönetebilir ve üyelerin ekip içi istatistiklerini görebilirsin.</p></div>
      </aside>
    </div>
  </div>;
}