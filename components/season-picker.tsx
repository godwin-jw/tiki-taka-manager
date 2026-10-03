import { Suspense } from "react";
import { CalendarRange, LockKeyhole } from "lucide-react";
import { SeasonSelect } from "@/components/season-select";

export type SeasonOption = { id: string; name: string; isActive: boolean; startDate: Date; endDate: Date };

const formatDate = (date: Date) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(date);

/**
 * Season switcher.
 *
 * Server component: it resolves which season is selected and renders the shadcn
 * Select through a small client wrapper. The choice is stored in the URL
 * (?season=), so pages stay bookmarkable and shareable.
 *
 * `showLabel` is off when the host tile already says "Sezon", to avoid a
 * duplicated heading.
 */
export function SeasonPicker({ seasons, selectedId, basePath, showLabel = true }: { seasons: SeasonOption[]; selectedId: string; basePath: string; showLabel?: boolean }) {
  if (seasons.length === 0) {
    return <p className="flex items-center gap-2 text-sm text-zinc-400"><CalendarRange className="size-4 text-zinc-600" />Henüz sezon tanımlanmadı.</p>;
  }
  const selected = seasons.find((season) => season.id === selectedId) ?? seasons[0];
  const label = showLabel ? "season-picker-label" : undefined;
  return <div className="space-y-3">
    {showLabel && <p id={label} className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-300"><CalendarRange className="size-4 text-emerald-400" />Sezon</p>}
    <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-md bg-white/5" />}><SeasonSelect seasons={seasons} selectedId={selected.id} basePath={basePath} labelledBy={label} /></Suspense>
    <p className="text-[11px] text-zinc-500">{formatDate(selected.startDate)} – {formatDate(selected.endDate)}</p>
  </div>;
}

/** Explains that the numbers below cannot be edited from the UI. */
export function SeasonReadOnlyNote({ seasonName, isActive }: { seasonName: string; isActive: boolean }) {
  return <p className="flex items-center gap-2 text-xs text-zinc-500">
    <LockKeyhole className="size-3.5" />
    {seasonName} istatistikleri salt okunur{isActive ? " ve devam ediyor." : " arşivlenmiş; yalnızca görüntülenebilir."}
  </p>;
}