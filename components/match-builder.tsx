"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Shuffle, Users, X } from "lucide-react";
import { useRoster } from "@/components/roster-context";
import { MobilePlayerPicker } from "@/components/mobile-player-picker";
import { TacticalPitch } from "@/components/tactical-pitch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { snakeDraft, type DraftPlayer, type RosterPlayer } from "@/lib/football";
import { parseLineup } from "@/lib/validation";
import { saveMatch } from "@/app/actions/global-match";
import { cn } from "@/lib/utils";

/**
 * Inline team name input.
 *
 * Deliberately a bare input on the match builder: the value is optional, falls
 * back to the platform default when empty, and is validated again on the server.
 * `maxLength` mirrors the 30-character server limit so the UI cannot drift.
 */
function TeamNameField({ id, label, value, onChange, disabled, placeholder, tone }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder: string; tone: "emerald" | "sky" }) {
  return <div className="space-y-2">
    <label htmlFor={id} className="text-xs font-semibold tracking-wide text-zinc-300">{label}</label>
    <input
      id={id}
      name={`${id}-name`}
      type="text"
      value={value}
      maxLength={30}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-11 w-full rounded-xl border bg-zinc-950/60 px-4 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus-visible:ring-2 disabled:opacity-50",
        tone === "emerald" ? "border-emerald-400/25 focus-visible:ring-emerald-400" : "border-sky-300/25 focus-visible:ring-sky-300",
      )}
    />
  </div>;
}

export function MatchBuilder({ requestId, crewId, crewName, crewRoster }: {
  requestId: string;
  /**
   * The active crew the match belongs to. The server does not trust this prop:
   * saveMatch re-reads the crew from the activeCrewId cookie and re-validates
   * membership, so a crafted value can never widen the scope.
   */
  crewId: string;
  crewName: string;
  /** The active crew's roster — the only pool this builder offers. */
  crewRoster: RosterPlayer[];
}) {
  const { players, selectedIds, capacity, setCapacity, toggle, clear, setPlayers } = useRoster();
  const [draft, setDraft] = useState<DraftPlayer[]>([]);
  const [draftSelection, setDraftSelection] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [state, action, pending] = useActionState(saveMatch, {});
  const selectionKey = [...selectedIds].sort().join(",");
  const validDraft = draft.length > 0 && draftSelection === selectionKey;
  // Matches are crew-only, so the pool is always the active crew's roster. The
  // context starts with the platform-wide roster from the layout; this one-shot
  // effect swaps it for the crew roster on mount. The ref guard keeps a rerun
  // effect from resetting a selection the user already made.
  const loadedCrewRef = useRef("");
  useEffect(() => {
    if (loadedCrewRef.current === crewId) return;
    loadedCrewRef.current = crewId;
    setPlayers(crewRoster);
  }, [crewId, crewRoster, setPlayers]);
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
      <MobilePlayerPicker />
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {selectedIds.length > 0 && missingKeeper && <p className="text-xs text-amber-200">İki kaleci seçilmedi. Takımlar kurulabilir; eksik kaleci mevkisini taktik tahtasında atayabilirsin.</p>}
    </section>
    {draft.length > 0 && !validDraft && <p role="status" className="rounded-xl border border-amber-400/20 p-4 text-sm text-amber-200">Oyuncu seçimi değişti. Takımları yeniden dengele.</p>}
    {validDraft && <><section className="glass space-y-4 p-6"><div className="flex flex-wrap items-center gap-2"><p className="eyebrow">TAKIM İSİMLERİ</p><span className="text-[10px] text-zinc-500">İsteğe bağlı · boş bırakırsan A Takımı / B Takımı kullanılır</span></div><div className="grid gap-3 sm:grid-cols-2"><TeamNameField id="team-a" label="A takımı" value={teamAName} onChange={setTeamAName} disabled={pending} placeholder="A Takımı" tone="emerald" /><TeamNameField id="team-b" label="B takımı" value={teamBName} onChange={setTeamBName} disabled={pending} placeholder="B Takımı" tone="sky" /></div></section><section className="glass flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex items-center gap-2 text-sm text-zinc-300"><Users className="size-4 text-emerald-400" />Maç <strong className="text-emerald-300">{crewName}</strong> ekibi için oluşturuluyor.</div><span className="text-[10px] text-zinc-500">Kadro yalnızca bu ekibin üyeleriyle sınırlıdır. Ekip değiştirmek için başlıktaki ekip seçicisini kullan.</span></section><TacticalPitch players={draft} onChange={pending ? undefined : setDraft} teamAName={teamAName.trim() || "A Takımı"} teamBName={teamBName.trim() || "B Takımı"} /><form action={action} className="glass space-y-4 p-6"><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="lineup" value={JSON.stringify(draft.map(({ id, team, position }) => ({ id, team, position })))} /><input type="hidden" name="teamAName" value={teamAName} /><input type="hidden" name="teamBName" value={teamBName} /><input type="hidden" name="date" value={date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toISOString() : ""} /><div className="flex flex-wrap items-end justify-between gap-4"><div className="space-y-2"><Label htmlFor="match-date">Maç tarihi ve saati (yerel saat)</Label><Input id="match-date" type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} disabled={pending} /></div><Button type="submit" disabled={pending || Boolean(lineupError)}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{pending ? "Kaydediliyor…" : "Kadroyu onayla ve maçı oluştur"}</Button></div>{lineupError && <p role="alert" className="text-sm text-amber-200">{lineupError}</p>}{state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}<p className="text-xs text-zinc-500">OVR değerleri kayıtta sunucudan alınır. Takımlardaki oyuncu sayıları eşit olmalıdır.</p></form></>}
  </div>;
}