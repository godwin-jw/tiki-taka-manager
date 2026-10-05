"use client";

import { createContext, useContext, useState } from "react";
import type { RosterPlayer } from "@/lib/football";

type RosterContextValue = {
  players: RosterPlayer[]; selectedIds: string[]; capacity: number;
  toggle: (id: string) => void; setCapacity: (size: number) => void; clear: () => void;
  /** Replaces the pool, e.g. when a match is switched from global to a crew. */
  setPlayers: (players: RosterPlayer[]) => void;
};
const RosterContext = createContext<RosterContextValue | null>(null);
export function RosterProvider({ players, children }: { players: RosterPlayer[]; children: React.ReactNode }) {
  const [pool, setPool] = useState(players);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [capacity, setSize] = useState(14);
  // Keep the pool in step when a server render hands down a different roster.
  if (pool !== players && JSON.stringify(pool) !== JSON.stringify(players)) setPool(players);
  function toggle(id: string) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(p => p !== id) : ids.length < capacity ? [...ids, id] : ids);
  }
  function setCapacity(size: number) { setSize(size); setSelectedIds(ids => ids.slice(0, size)); }
  // Switching scope invalidates every selection: a player from the previous pool
  // must not survive into a crew lineup, which would fail validation server-side.
  function setPlayers(next: RosterPlayer[]) {
    setPool(next);
    setSelectedIds(ids => ids.filter(id => next.some(p => p.id === id)));
  }
  return <RosterContext.Provider value={{ players: pool, selectedIds, capacity, toggle, setCapacity, clear: () => setSelectedIds([]), setPlayers }}>{children}</RosterContext.Provider>;
}
export function useRoster() {
  const context = useContext(RosterContext);
  if (!context) throw new Error("Oyuncu havuzu uygulama kabuğu içinde kullanılmalıdır.");
  return context;
}