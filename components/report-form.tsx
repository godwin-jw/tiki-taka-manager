"use client";

import { useActionState, useState } from "react";
import { CheckCheck, LoaderCircle, Minus, Plus, Star } from "lucide-react";
import { submitMatchReport } from "@/app/actions/global-match";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerAvatar } from "@/components/player-avatar";
import type { Team } from "@/lib/football";

export type ReportPlayer = { id: string; name: string; image: string | null; team: Team };
function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <div className="flex items-center gap-1"><Button type="button" variant="outline" size="icon-sm" disabled={value <= 0} aria-label={`${label} azalt`} onClick={() => onChange(value - 1)}><Minus /></Button><output aria-label={label} className="min-w-6 text-center font-mono text-sm">{value}</output><Button type="button" variant="outline" size="icon-sm" disabled={value >= 99} aria-label={`${label} artır`} onClick={() => onChange(value + 1)}><Plus /></Button></div>;
}
export function ReportForm({ matchId, players }: { matchId: string; players: ReportPlayer[] }) {
  const [stats, setStats] = useState(players.map(p => ({ id: p.id, goals: 0, assists: 0 })));
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [motmId, setMotmId] = useState("");
  const [state, action, pending] = useActionState(submitMatchReport, {});
  function update(id: string, key: "goals" | "assists", value: number) { setStats(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row)); }
  const totals = (team: Team, key: "goals" | "assists") => stats.filter(s => players.some(p => p.id === s.id && p.team === team)).reduce((sum, p) => sum + p[key], 0);
  const consistent = totals("A", "goals") === scoreA && totals("B", "goals") === scoreB && totals("A", "assists") <= scoreA && totals("B", "assists") <= scoreB;
  return <form action={action} className="space-y-6"><input type="hidden" name="matchId" value={matchId} /><input type="hidden" name="report" value={JSON.stringify({ scoreA, scoreB, motmId, players: stats })} />
    <fieldset disabled={pending} className="space-y-6"><div className="glass flex items-center justify-center gap-6 p-8 sm:gap-12"><div className="space-y-3 text-center"><Label htmlFor="score-a" className="justify-center text-emerald-300">TAKIM A</Label><Input id="score-a" type="number" required min={0} max={99} value={scoreA} onChange={e => setScoreA(e.target.value === "" ? 0 : Number(e.target.value))} className="h-20 w-24 text-center font-mono text-4xl! font-bold" /></div><span className="font-mono text-3xl text-zinc-600">:</span><div className="space-y-3 text-center"><Label htmlFor="score-b" className="justify-center text-sky-300">TAKIM B</Label><Input id="score-b" type="number" required min={0} max={99} value={scoreB} onChange={e => setScoreB(e.target.value === "" ? 0 : Number(e.target.value))} className="h-20 w-24 text-center font-mono text-4xl! font-bold" /></div></div>
      <div className="grid gap-5 xl:grid-cols-2">{(["A", "B"] as const).map(team => <section key={team} className="glass overflow-hidden"><header className="border-b border-white/10 p-5"><h2 className="font-bold">Takım {team}</h2><p className="mt-1 text-xs text-zinc-400">{totals(team, "goals")} gol / {totals(team, "assists")} asist</p></header><div className="divide-y divide-white/5">{players.filter(p => p.team === team).map(p => { const row = stats.find(s => s.id === p.id)!; return <div key={p.id} className="space-y-3 p-4"><div className="flex items-center gap-3"><PlayerAvatar name={p.name} image={p.image} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300/20 px-2 py-2 text-xs text-amber-200"><input type="radio" name="motm-choice" value={p.id} checked={motmId === p.id} onChange={() => setMotmId(p.id)} required aria-label={`${p.name} maçın adamı`} className="accent-amber-300" /><Star className="size-3" />MOTM</label></div><div className="flex flex-wrap justify-end gap-5"><div className="space-y-1"><p className="text-[10px] text-zinc-500">GOL</p><Counter label={`${p.name} gol`} value={row.goals} onChange={n => update(p.id, "goals", n)} /></div><div className="space-y-1"><p className="text-[10px] text-zinc-500">ASİST</p><Counter label={`${p.name} asist`} value={row.assists} onChange={n => update(p.id, "assists", n)} /></div></div></div>; })}</div></section>)}</div>
      <div className="glass space-y-4 p-6"><p className="text-sm text-zinc-400">Oyuncu golleri takım skoruna eşit olmalı; asistler takımın gol sayısını aşamaz. Bir oyuncuyu maçın adamı seç. Onaylanan rapor tekrar işlenmez.</p>{!consistent && <p role="status" className="text-sm text-amber-200">Skor ve oyuncu istatistiklerini eşleştir.</p>}<label className="flex items-center gap-3 text-sm"><input type="checkbox" name="confirm" required className="size-4 accent-emerald-400" />Sonuçları kontrol ettim; raporu kalıcı olarak onaylıyorum.</label><Button type="submit" disabled={pending || !consistent || !motmId}>{pending ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}{pending ? "Rapor işleniyor…" : "Raporu onayla"}</Button></div>
    </fieldset>{state.error && <p role="alert" className="rounded-xl border border-rose-400/20 p-4 text-sm text-rose-300">{state.error}</p>}
  </form>;
}