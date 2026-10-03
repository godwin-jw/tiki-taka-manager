"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Crown, LoaderCircle, LogOut, Send, Shield, UserPlus } from "lucide-react";
import { cancelCrewRequestAction, createCrewAction, leaveCrewAction, requestToJoinAction, reviewCrewRequestAction } from "@/app/actions/crew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerAvatar } from "@/components/player-avatar";

function Feedback({ state }: { state: { error?: string; success?: string } }) {
  return <>{state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}</>;
}

export function CreateCrewForm() {
  const [state, action, pending] = useActionState(createCrewAction, {});
  return <form action={action} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="crew-name">Ekip adı</Label><Input id="crew-name" name="name" required minLength={3} maxLength={40} placeholder="Kartal SK" /></div>
    <p className="text-[11px] text-zinc-500">Ekipi sen kurduğunda otomatik olarak kaptan olursun.</p>
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Shield />}{pending ? "Kuruluyor…" : "Ekip kur"}</Button>
  </form>;
}

export function JoinCrewForm({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(requestToJoinAction, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="crewId" value={crewId} />
    <div className="space-y-2"><Label htmlFor={`join-message-${crewId}`}>Kaptana not <span className="text-xs text-zinc-500">(isteğe bağlı)</span></Label><Input id={`join-message-${crewId}`} name="message" maxLength={200} placeholder="Mevki ve beklentini yaz." /></div>
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}{pending ? "Gönderiliyor…" : "Katılma isteği gönder"}</Button>
  </form>;
}

export function CancelRequestButton({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(cancelCrewRequestAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="crewId" value={crewId} />
    <Feedback state={state} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : null}{pending ? "Geri çekiliyor…" : "İsteği geri çek"}</Button>
  </form>;
}

export function LeaveCrewButton({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(leaveCrewAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="crewId" value={crewId} />
    <Feedback state={state} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}{pending ? "Ayrılıyor…" : "Ekipten ayrıl"}</Button>
  </form>;
}

export function CrewSearchForm({ query }: { query: string }) {
  return <form role="search" className="flex gap-2">
    <Input name="q" defaultValue={query} placeholder="Ekip ara…" aria-label="Ekip adına göre ara" minLength={2} maxLength={40} />
    <Button type="submit" variant="outline">Ara</Button>
  </form>;
}

export function BackToCrewsLink() {
  return <Link href="/ekipler" className="text-xs text-zinc-400 hover:text-white">← Ekipler listesine dön</Link>;
}

type PendingRequest = {
  id: string;
  message: string | null;
  user: { id: string; name: string | null; image: string | null; playerProfile: { ovrRating: number; position: string } | null };
};

/** Captain-only panel: every pending request with accept / reject actions. */
export function CrewRequestsPanel({ crewId, requests }: { crewId: string; requests: PendingRequest[] }) {
  const [state, action, pending] = useActionState(reviewCrewRequestAction, {});
  return <section aria-label="Katılma istekleri" className="glass space-y-5 p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Crown className="size-5 text-amber-300" />Katılma istekleri</h2>
      <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">{requests.length} bekleyen</span>
    </div>
    <Feedback state={state} />
    {requests.length === 0
      ? <p className="text-sm text-zinc-500">Bekleyen istek yok. Yeni istekler burada görünecek.</p>
      : <ul className="space-y-3">{requests.map(request => {
        const profile = request.user.playerProfile;
        const label = request.user.name || "Oyuncu";
        return <li key={request.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <PlayerAvatar name={label} image={request.user.image} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label}</p>
              <p className="text-xs text-zinc-500">{profile ? `${profile.position} · ${Math.round(profile.ovrRating)} OVR` : "Profil yok"}{request.message ? ` · "${request.message}"` : ""}</p>
            </div>
          </div>
          <form action={action} className="flex gap-2" aria-label={`${label} isteğini yönet`}>
            <input type="hidden" name="crewId" value={crewId} />
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" name="decision" value="ACCEPT" size="sm" disabled={pending} aria-label={`${label} ekibe katıl`}>{pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Kabul et</Button>
            <Button type="submit" name="decision" value="REJECT" size="sm" variant="outline" disabled={pending} aria-label={`${label} isteğini reddet`}>{pending ? <LoaderCircle className="animate-spin" /> : <Send />}Reddet</Button>
          </form>
        </li>;
      })}</ul>}
  </section>;
}