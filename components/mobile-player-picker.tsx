"use client";

import { useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PlayerAvatar } from "@/components/player-avatar";
import { OvrBadge } from "@/components/ovr-badge";
import { useRoster } from "@/components/roster-context";
import { positions, positionLabels, type Position } from "@/lib/football";
import { cn } from "@/lib/utils";

/**
 * Mobile roster picker.
 *
 * On phones the global roster lives in the off-canvas sidebar. This puts the
 * same filtering and selection into a bottom sheet above the match builder,
 * with Tabs splitting "Tümü" from "Seçtiklerim" and a position chip row, so a
 * captain never has to leave the draft to add a player.
 */
export function MobilePlayerPicker() {
  const { players, selectedIds, capacity, toggle } = useRoster();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "selected">("all");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");

  const full = selectedIds.length >= capacity;
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return players.filter(player =>
      player.name.toLocaleLowerCase("tr-TR").includes(needle)
      && (position === "ALL" || player.position === position)
      && (tab === "all" || selectedIds.includes(player.id)),
    );
  }, [players, search, position, tab, selectedIds]);

  return <>
    {/* Sticky bar: keeps the picker one thumb-reach away while drafting. */}
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
      <Button type="button" onClick={() => setOpen(true)} className="w-full justify-between" aria-haspopup="dialog">
        <span className="flex items-center gap-2"><Users className="size-4" />Oyuncu ekle</span>
        <Badge className="bg-emerald-400/15 text-emerald-300">{selectedIds.length} / {capacity}</Badge>
      </Button>
    </div>

    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-h-[80vh]">
        <SheetHeader className="border-b border-white/10 pb-4">
          <SheetTitle>Oyuncu seç</SheetTitle>
          <SheetDescription>{selectedIds.length} / {capacity} oyuncu seçildi. Listeden dokunarak ekle veya çıkar.</SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)} className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="px-4 pt-4">
            <TabsList className="w-full">
              <TabsTrigger value="all">Tümü <span className="ml-1 text-[10px] text-zinc-500">{players.length}</span></TabsTrigger>
              <TabsTrigger value="selected">Seçtiklerim <span className="ml-1 text-[10px] text-emerald-400">{selectedIds.length}</span></TabsTrigger>
            </TabsList>
          </div>

          <div className="space-y-3 px-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Oyuncu ara…"
                aria-label="Maç kadrosunda oyuncu ara"
                className="pl-9"
              />
            </div>
            <div role="group" aria-label="Mevki filtresi" className="flex gap-2 overflow-x-auto pb-1">
              {(["ALL", ...positions] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPosition(value)}
                  aria-pressed={position === value}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    position === value ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-zinc-400 hover:text-white",
                  )}
                >
                  {value === "ALL" ? "Tümü" : value}
                </button>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {filtered.length === 0
              ? <p className="py-8 text-center text-sm text-zinc-500">{tab === "selected" ? "Henüz oyuncu seçmedin." : "Aramana uygun oyuncu yok."}</p>
              : <ul className="space-y-2">
                  {filtered.map(player => {
                    const selected = selectedIds.includes(player.id);
                    const blocked = !selected && full;
                    return <li key={player.id}>
                      <button
                        type="button"
                        onClick={() => toggle(player.id)}
                        disabled={blocked}
                        aria-pressed={selected}
                        aria-label={`${player.name}, ${positionLabels[player.position]}, ${player.isUnrated ? "bu ekipte puan yok" : `${Math.round(player.ovrRating)} OVR`}, ${selected ? "seçimi kaldır" : "kadroya ekle"}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                          selected ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-white/[0.03]",
                          blocked && "cursor-not-allowed opacity-40",
                        )}
                      >
                        <PlayerAvatar name={player.name} image={player.image} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{player.name}</span>
                          <span className="block text-[11px] text-zinc-500">{player.position} · {positionLabels[player.position]}</span>
                        </span>
                        <OvrBadge value={player.ovrRating} isUnrated={player.isUnrated} />
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border", selected ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-white/15")}>
                          {selected ? <Check className="size-4" /> : <X className="size-3.5 text-transparent" />}
                        </span>
                      </button>
                    </li>;
                  })}
                </ul>}
          </div>

          <div className="border-t border-white/10 p-4">
            <Button type="button" onClick={() => setOpen(false)} className="w-full" disabled={selectedIds.length !== capacity}>
              {selectedIds.length === capacity ? "Seçimi tamamla" : `${capacity - selectedIds.length} oyuncu daha seç`}
            </Button>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  </>;
}