import { ratingTier } from "@/lib/football";
import { cn } from "@/lib/utils";

const colors = { gold: "border-amber-300/30 bg-amber-400/10 text-amber-200", silver: "border-slate-300/30 bg-slate-300/10 text-slate-200", bronze: "border-orange-400/25 bg-orange-500/10 text-orange-300" };
export function OvrBadge({ value, className }: { value: number; className?: string }) {
  return <span aria-label={`${value.toFixed(1)} genel reyting`} className={cn("flex min-w-11 flex-col items-center rounded-lg border px-2 py-1 font-mono", colors[ratingTier(value)], className)}>
    <span className="text-lg leading-5 font-bold">{Math.round(value)}</span><span className="text-[8px] tracking-widest">OVR</span>
  </span>;
}