"use client";

import { useActionState, useState } from "react";
import { Check, LoaderCircle, Shuffle, Users, X } from "lucide-react";
import { useRoster } from "@/components/roster-context";
import { TacticalPitch } from "@/components/tactical-pitch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { snakeDraft, type DraftPlayer } from "@/lib/football";
import { parseLineup } from "@/lib/validation";
import { saveMatch } from "@/app/actions/global-match";

export function MatchBuilder({ requestId }: { requestId: string }) {
  const { players, selectedIds, capacity, setCapacity, toggle, clear } = useRoster();
  const [draft, setDraft] = useState<DraftPlayer[]>([]);
  const [draftSelection, setDraftSelection] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [state, action, pending] = useActionState(saveMatch, {});
  const selectionKey = [...selectedIds].sort().join(",");
  const validDraft = draft.length > 0 && draftSelection === selectionKey;
  let lineupError = "";
  if (validDraft) { try { parseLineup(draft); } catch (error) { lineupError = error instanceof Error ? error.message : "Kadroyu kontrol et."; } }
  function generate() {
    try {
      if (selectedIds.length !== capacity) throw new Error(`Tam ${capacity} oyuncu seçmelisin.`);
      setDraft(snakeDraft(players.filter(p => selectedIds.includes(p.id)))); setDraftSelection(selectionKey); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Takımlar oluşturulamadı."); }
  }
  const missingKeeper = players.filter(p => selectedIds.includes(p.id) && p.position === "GK").length < 2;
  return <div className="space-y-6"><section className="glass space-y-5 p-6"><div className="flex flex-wrap items-end justify-between gap-5"><div className="space-y-2"><Label htmlFor="player-count">Toplam oyuncu</Label><select id="player-count" value={capacity} onChange={e => setCapacity(Number(e.target.value))} disabled={pending} className="field-select w-44">{[4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(n => <option key={n} value={n}>{n} kişi · {n / 2} vs {n / 2}</option>)}</select></div><div className="flex gap-2"><Button type="button" variant="ghost" onClick={clear} disabled={pending || !selectedIds.length}>Seçimi temizle</Button><Button type="button" onClick={generate} disabled={pending || selectedIds.length !== capacity}><Shuffle />Takımları dengele</Button></div></div>
      <div className="flex items-center gap-2 text-sm text-zinc-400"><Users className="size-4 text-emerald-400" />{selectedIds.length} / {capacity} seçildi <span className="text-xs text-zinc-500">· Sol havuzdan veya mobil menüden oyuncu işaretle.</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${selectedIds.length / capacity * 100}%` }} /></div>
      <div className="flex flex-wrap gap-2">{players.filter(p => selectedIds.includes(p.id)).map(p => <button key={p.id} type="button" disabled={pending} onClick={() => toggle(p.id)} aria-label={`${p.name} seçimini kaldır`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-800/50 px-3 py-2 text-xs">{p.name}<X className="size-3 text-zinc-400" /></button>)}</div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {selectedIds.length > 0 && missingKeeper && <p className="text-xs text-amber-200">İki kaleci seçilmedi. Takımlar kurulabilir; eksik kaleci mevkisini taktik tahtasında atayabilirsin.</p>}
    </section>
    {draft.length > 0 && !validDraft && <p role="status" className="rounded-xl border border-amber-400/20 p-4 text-sm text-amber-200">Oyuncu seçimi değişti. Takımları yeniden dengele.</p>}
    {validDraft && <><TacticalPitch players={draft} onChange={pending ? undefined : setDraft} /><form action={action} className="glass space-y-4 p-6"><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="lineup" value={JSON.stringify(draft.map(({ id, team, position }) => ({ id, team, position })))} /><input type="hidden" name="date" value={date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toISOString() : ""} /><div className="flex flex-wrap items-end justify-between gap-4"><div className="space-y-2"><Label htmlFor="match-date">Maç tarihi ve saati (yerel saat)</Label><Input id="match-date" type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} disabled={pending} /></div><Button type="submit" disabled={pending || Boolean(lineupError)}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{pending ? "Kaydediliyor…" : "Kadroyu onayla ve maçı oluştur"}</Button></div>{lineupError && <p role="alert" className="text-sm text-amber-200">{lineupError}</p>}{state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}<p className="text-xs text-zinc-500">OVR değerleri kayıtta sunucudan alınır. Takımlardaki oyuncu sayıları eşit olmalıdır.</p></form></>}
  </div>;
}