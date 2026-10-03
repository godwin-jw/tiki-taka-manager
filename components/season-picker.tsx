import Link from "next/link";
import { CalendarRange, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

export type SeasonOption = { id: string; name: string; isActive: boolean; startDate: Date; endDate: Date };

const formatDate = (date: Date) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(date);

/**
 * Season switcher. Each season is a plain GET link so the selection lives in the
 * URL, stays bookmarkable and works without client JavaScript.
 *
 * `showLabel` is off when the host tile already says "Sezon", to avoid a
 * duplicated heading.
 */
export function SeasonPicker({ seasons, selectedId, hrefFor, showLabel = true }: { seasons: SeasonOption[]; selectedId: string; hrefFor: (seasonId: string) => string; showLabel?: boolean }) {
  if (seasons.length === 0) {
    return <p className="flex items-center gap-2 text-sm text-zinc-400"><CalendarRange className="size-4 text-zinc-600" />Henüz sezon tanımlanmadı.</p>;
  }
  const selected = seasons.find((season) => season.id === selectedId) ?? seasons[0];
  return <div className="space-y-3">
    {showLabel && <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-300"><CalendarRange className="size-4 text-emerald-400" />Sezon</p>}
    <div role="group" aria-label="Sezon seç" className="flex flex-wrap gap-2">
      {seasons.map((season) => {
        const active = season.id === selected.id;
        return <Link
          key={season.id}
          href={hrefFor(season.id)}
          aria-current={active ? "true" : undefined}
          className={cn(
            "rounded-xl border px-4 py-2 text-sm transition-colors",
            active ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white",
          )}
        >
          {season.name}
          {season.isActive && <span className="ml-2 text-[10px] tracking-wider uppercase opacity-70">aktif</span>}
        </Link>;
      })}
    </div>
    <p className="text-[11px] text-zinc-500">{formatDate(selected.startDate)} – {formatDate(selected.endDate)}</p>
  </div>;
}

/** Explains that the numbers below cannot be edited from the UI. */
export function SeasonReadOnlyNote({ seasonName, isActive }: { seasonName: string; isActive: boolean }) {
  return <p className="flex items-center gap-2 text-xs text-zinc-500">
    <LockKeyhole className="size-3.5" />
    {seasonName} istatistikleri salt okunur{isActive ? " ve devam ediyor." : " arĻivlenmiş; yalnızca görüntülenebilir."}
  </p>;
}