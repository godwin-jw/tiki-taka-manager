"use client";

import { createContext, useContext, useState } from "react";
import type { RosterPlayer } from "@/lib/football";

type RosterContextValue = {
  players: RosterPlayer[]; selectedIds: string[]; capacity: number;
  toggle: (id: string) => void; setCapacity: (size: number) => void; clear: () => void;
};
const RosterContext = createContext<RosterContextValue | null>(null);
export function RosterProvider({ players, children }: { players: RosterPlayer[]; children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [capacity, setSize] = useState(14);
  function toggle(id: string) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(p => p !== id) : ids.length < capacity ? [...ids, id] : ids);
  }
  function setCapacity(size: number) { setSize(size); setSelectedIds(ids => ids.slice(0, size)); }
  return <RosterContext.Provider value={{ players, selectedIds, capacity, toggle, setCapacity, clear: () => setSelectedIds([]) }}>{children}</RosterContext.Provider>;
}
export function useRoster() {
  const context = useContext(RosterContext);
  if (!context) throw new Error("Oyuncu havuzu uygulama kabuğu içinde kullanılmalıdır.");
  return context;
}