"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { submitPlayerRating } from "@/app/actions/rating";
import { ratingAttributes, overallRating, type AttributeScores } from "@/lib/rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RatingForm({ playerProfileId, initialScores }: { playerProfileId: string; initialScores: AttributeScores | null }) {
  const [scores, setScores] = useState<AttributeScores>(initialScores ?? { pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 });
  const [state, action, pending] = useActionState(submitPlayerRating, {});
  return <section className="glass space-y-6 p-6"><div><p className="eyebrow">YOUR SCOUT REPORT</p><h2 className="mt-2 text-lg font-semibold">{initialScores ? "Değerlendirmeni güncelle" : "Oyuncuyu değerlendir"}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Altı özelliğe 0–99 arası tam sayı ver. Tekrar gönderdiğinde önceki oyun güncellenir; oy sayısı artmaz. Başlangıçtaki 50 değerleri öneri değil, düzenlenebilir form değerleridir.</p></div>
    <form action={action} className="space-y-6"><input type="hidden" name="playerProfileId" value={playerProfileId} />
      <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">{ratingAttributes.map(attr => <div key={attr.key} className="space-y-3"><div className="flex items-center justify-between gap-3"><Label htmlFor={`rating-${attr.key}`}>{attr.label} ({attr.code})</Label><Input id={`rating-${attr.key}`} name={attr.key} type="number" min={0} max={99} step={1} required value={scores[attr.key]} onChange={e => setScores(prev => ({ ...prev, [attr.key]: e.target.value === "" ? 0 : Number(e.target.value) }))} className="w-20 text-center font-mono" /></div><input aria-label={`${attr.label} puan kaydırıcısı`} type="range" min={0} max={99} step={1} value={scores[attr.key]} onChange={e => setScores(prev => ({ ...prev, [attr.key]: Number(e.target.value) }))} className="h-6 w-full accent-emerald-400" /><p className="text-xs text-zinc-500">{attr.description}</p></div>)}</fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5"><p className="text-sm text-zinc-400">Senin değerlendirmen: <output className="font-mono text-xl font-bold text-emerald-300" aria-label="Değerlendirme OVR önizlemesi">{overallRating(scores).toFixed(1)}</output> OVR</p><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{pending ? "Kaydediliyor…" : "Değerlendirmeyi kaydet"}</Button></div>
      {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}
    </form>
  </section>;
}