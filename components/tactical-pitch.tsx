"use client";

import { ArrowLeftRight, GripVertical } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { positions, teamAverage, type DraftPlayer, type Position, type Team } from "@/lib/football";
import { cn } from "@/lib/utils";

export function TacticalPitch({ players, onChange, teamAName = "A Takımı", teamBName = "B Takımı" }: { players: DraftPlayer[]; onChange?: (players: DraftPlayer[]) => void; teamAName?: string; teamBName?: string }) {
  const teamNames = { A: teamAName, B: teamBName } as const;
  function move(id: string, team: Team, position: Position) {
    onChange?.(players.map(p => p.id === id ? { ...p, team, position } : p));
  }
  function swap(sourceId: string, targetId: string) {
    const source = players.find(p => p.id === sourceId);
    const target = players.find(p => p.id === targetId);
    if (!source || !target || source.id === target.id) return;
    onChange?.(players.map(p => p.id === source.id ? { ...p, team: target.team, position: target.position } : p.id === target.id ? { ...p, team: source.team, position: source.position } : p));
  }
  return <div className="grid gap-6 xl:grid-cols-2">{(["A", "B"] as const).map(team => <section key={team} aria-label={`${team} takımı taktik tahtası`} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60">
    <header className="flex items-center justify-between p-5"><div className="flex items-center gap-3"><span className={cn("flex size-9 items-center justify-center rounded-lg font-black", team === "A" ? "bg-emerald-400/15 text-emerald-300" : "bg-sky-400/15 text-sky-300")}>{team}</span><div><h2 className="font-bold">{teamNames[team]}</h2><p className="text-xs text-zinc-500">{players.filter(p => p.team === team).length} oyuncu</p></div></div><p className="font-mono text-lg font-bold">{teamAverage(players, team).toFixed(1)} <span className="text-[10px] text-zinc-500">ORT. OVR</span></p></header>
    <div className="pitch relative m-3 grid min-h-[560px] grid-rows-4 gap-3 overflow-hidden rounded-xl border border-emerald-200/20 p-3 sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-4 rounded border border-white/15"><div className="absolute top-1/2 w-full border-t border-white/15" /><div className="absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" /><div className="absolute bottom-0 left-1/4 h-16 w-1/2 border border-white/15" /></div>
      {([...positions].reverse()).map(position => <div key={position} aria-label={`${team} ${position} alanı`} onDragOver={e => { if (onChange) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (onChange) move(e.dataTransfer.getData("text/plain"), team, position); }} className="relative z-10 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 p-2">
        <span className="absolute top-1 left-2 text-[8px] font-bold tracking-widest text-emerald-100/40">{position}</span>
        {players.filter(p => p.team === team && p.position === position).map(p => <div key={p.id} draggable={Boolean(onChange)} onDragStart={e => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={e => { if (onChange) e.preventDefault(); }} onDrop={e => { if (onChange) { e.preventDefault(); e.stopPropagation(); swap(e.dataTransfer.getData("text/plain"), p.id); } }} className={cn("flex w-24 flex-col items-center rounded-xl border bg-zinc-950/85 p-2 shadow-xl backdrop-blur-md", team === "A" ? "border-emerald-400/30" : "border-sky-300/30", onChange && "cursor-grab active:cursor-grabbing")}>
          <div className="relative"><PlayerAvatar name={p.name} image={p.image} /><span className="absolute -right-3 -bottom-1 rounded bg-zinc-800 px-1 font-mono text-[10px] font-bold text-amber-200">{Math.round(p.ovrRating)}</span></div><p className="mt-2 w-full truncate text-center text-[10px] font-semibold" title={p.name}>{p.name}</p>{onChange && <GripVertical aria-hidden="true" className="mt-1 size-3 text-zinc-500" />}
        </div>)}
      </div>)}
    </div>
    {onChange && <div className="space-y-2 p-4 pt-0"><p className="mb-3 text-[11px] text-zinc-400">Sürükleyerek taşı; oyuncu üzerine bırakarak yer değiştir. Klavye / mobil kontrolleri:</p>{players.filter(p => p.team === team).map(p => <div key={p.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs">{p.name}</span><select aria-label={`${p.name} mevkii`} className="field-select h-9 w-20" value={p.position} onChange={e => move(p.id, p.team, e.target.value as Position)}>{positions.map(pos => <option key={pos}>{pos}</option>)}</select><Button type="button" variant="outline" size="icon" aria-label={`${p.name} diğer takıma taşı`} onClick={() => move(p.id, team === "A" ? "B" : "A", p.position)}><ArrowLeftRight className="size-3" /></Button></div>)}</div>}
  </section>)}</div>;
}