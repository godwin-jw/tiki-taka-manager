import type { Metadata } from "next";
import { Crown, LockKeyhole, Medal, ShieldCheck, Swords, Target, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlayerCard } from "@/components/player-card";
import { ProfileForm, CaptainForm } from "@/components/profile-form";
import { Badge } from "@/components/ui/badge";
import { getRatingSummary } from "@/lib/rating-data";
import { RatingSummary } from "@/components/rating-summary";

export const metadata: Metadata = { title: "Oyuncu Profilim" };
export default async function ProfilePage() {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id }, include: { playerProfile: true } });
  const profile = user.playerProfile;
  const summary = profile ? await getRatingSummary(profile.id) : null;
  const stats = [{ label: "Oynanan maç", value: profile?.matchesPlayed ?? 0, icon: Swords }, { label: "Gol", value: profile?.goals ?? 0, icon: Target }, { label: "Asist", value: profile?.assists ?? 0, icon: Medal }, { label: "Maçın adamı", value: profile?.motmCount ?? 0, icon: Trophy }];
  return <div className="space-y-8"><div><p className="eyebrow">PLAYER IDENTITY</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Sahadaki kimliğin.</h1><p className="mt-2 text-sm text-zinc-400">Profilini özelleştir. Performansın senin adına konuşsun.</p></div>
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="glass relative flex flex-col items-center gap-6 overflow-hidden p-6 text-center sm:p-8"><div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-emerald-500/10 blur-3xl" /><PlayerCard name={user.name || "Oyuncu"} image={user.image} position={profile?.position ?? "MID"} ovr={profile?.ovrRating ?? 0} jerseyNumber={profile?.jerseyNumber} captain={user.role === "CAPTAIN"} scores={summary?.scores ?? null} ratingCount={summary?.count ?? 0} className="relative mx-auto" /><div className="relative space-y-3"><h2 className="text-2xl font-bold">{user.name || "Oyuncu"}</h2><div className="flex flex-wrap justify-center gap-2"><Badge variant="secondary">{profile?.position ?? "MID"}</Badge><Badge variant="outline">#{profile?.jerseyNumber ?? "—"}</Badge><Badge className="bg-emerald-400/10 text-emerald-300">{user.role === "CAPTAIN" ? "KAPTAN" : "OYUNCU"}</Badge></div></div><div className="relative flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-zinc-500"><ShieldCheck className="size-4 text-emerald-400" />Google hesabıyla doğrulandı</div></section>
      <section className="glass p-6 sm:p-8 xl:col-span-2"><h2 className="mb-6 text-lg font-semibold">Kişisel bilgiler</h2><ProfileForm profile={{ name: user.name || "", phone: user.phone || "", jerseyNumber: profile?.jerseyNumber ?? null, position: profile?.position ?? "MID" }} /></section>
      <section className="xl:col-span-3"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Kariyer istatistikleri</h2><span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500"><LockKeyhole className="size-3" />Salt okunur</span></div><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{stats.map(stat => <div key={stat.label} className="glass p-6"><stat.icon className="mb-5 size-5 text-emerald-400" /><p className="font-mono text-4xl font-bold">{stat.value}</p><p className="mt-2 text-xs text-zinc-400">{stat.label}</p></div>)}</div><p className="mt-3 text-xs text-zinc-500">OVR ve kariyer istatistikleri bu sayfadan değiştirilemez. Gol, asist, maç ve MOTM değerleri onaylanan raporlardan güncellenir.</p></section>
      <section className="glass space-y-4 border-amber-400/15 p-6 xl:col-span-3"><h2 className="flex items-center gap-2 font-semibold"><Crown className="size-5 text-amber-300" />{user.role === "CAPTAIN" ? "Kaptanlık yetkin aktif" : "Oyunu yöneten sen ol"}</h2><p className="max-w-2xl text-sm text-zinc-400">Kaptanlar maç oluşturabilir, takımları düzenleyebilir ve kendi maçlarının sonuçlarını onaylayabilir.</p>{user.role !== "CAPTAIN" && <CaptainForm />}</section>
      {summary && <div className="xl:col-span-3"><RatingSummary {...summary} ovr={profile?.ovrRating ?? 0} /></div>}
    </div>
  </div>;
}