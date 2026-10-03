"use client";
import { useActionState } from "react";
import { Crown, LoaderCircle, Save } from "lucide-react";
import { updateProfile, becomeCaptain } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { positions, positionLabels, type Position } from "@/lib/football";

export function ProfileForm({ profile }: { profile: { name: string; phone: string; jerseyNumber: number | null; position: Position } }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return <form action={action} className="space-y-6">
    <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="profile-name">Ad soyad</Label><Input id="profile-name" name="name" autoComplete="name" required minLength={2} maxLength={60} defaultValue={profile.name} /></div>
      <div className="space-y-2"><Label htmlFor="profile-phone">Telefon <span className="text-xs text-zinc-500">(isteğe bağlı)</span></Label><Input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength={25} placeholder="+90 5xx xxx xx xx" defaultValue={profile.phone} /><p className="text-[11px] text-zinc-500">Yalnızca sen görebilirsin.</p></div>
      <div className="space-y-2"><Label htmlFor="profile-jersey">Forma numarası</Label><Input id="profile-jersey" name="jerseyNumber" type="number" min={1} max={99} placeholder="1–99" defaultValue={profile.jerseyNumber ?? ""} /></div>
      <div className="space-y-2"><Label htmlFor="profile-position">Ana mevkii</Label><select id="profile-position" name="position" defaultValue={profile.position} className="field-select">{positions.map(p => <option key={p} value={p}>{p} · {positionLabels[p]}</option>)}</select></div>
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</Button>
  </form>;
}

export function CaptainForm() {
  const [state, action, pending] = useActionState(becomeCaptain, {});
  return <form action={action} className="space-y-4"><label className="flex items-start gap-3 text-sm text-zinc-400"><input type="checkbox" name="confirm" required disabled={pending} className="mt-1 size-4 accent-emerald-400" />Kadroları ve maç sonuçlarını adil ve doğru şekilde yöneteceğimi kabul ediyorum.</label>
    {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}
    <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Crown />}Kaptanlık yetkisini al</Button>
  </form>;
}