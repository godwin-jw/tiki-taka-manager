"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Client half of the season switcher.
 *
 * The selection still lives in the URL (?season=). Functions cannot cross the
 * server/client boundary, so the wrapper is given the *base path* and rebuilds
 * the href itself: it swaps the `season` param and keeps every other one. That
 * preserves the bookmarkable, shareable contract while the page stays server
 * rendered.
 */
export function SeasonSelect({ seasons, selectedId, basePath, labelledBy }: { seasons: Array<{ id: string; name: string; isActive: boolean }>; selectedId: string; basePath: string; labelledBy?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const hrefFor = (seasonId: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("season", seasonId);
    return `${basePath}?${next.toString()}`;
  };

  return <Select
    value={selectedId}
    // Not `disabled`: flipping it during the transition can race the open menu and
    // swallow the selection. aria-busy communicates the same thing safely.
    aria-busy={pending}
    aria-labelledby={labelledBy}
    onValueChange={(next) => {
      if (next === selectedId) return;
      startTransition(() => router.push(hrefFor(next), { scroll: false }));
    }}
  >
    <SelectTrigger className="h-10 w-full border-white/10 bg-white/[0.03] text-zinc-100 data-[placeholder]:text-zinc-500">
      <SelectValue placeholder="Sezon seç" />
    </SelectTrigger>
    <SelectContent className="border-white/10 bg-zinc-900 text-zinc-100">
      {seasons.map((season) => (
        <SelectItem key={season.id} value={season.id} className="focus:bg-emerald-400/10 focus:text-emerald-200">
          {season.name}
          {season.isActive ? " · aktif" : ""}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>;
}