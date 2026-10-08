import { Crown } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { positionLabels, ratingTier, type Position } from "@/lib/football";
import { ratingAttributes, type AttributeScores } from "@/lib/rating";
import { cn } from "@/lib/utils";

/**
 * Shield silhouette. It stays full width from 4% to 86% of the card height, so
 * every piece of content is laid out inside that band and can never be sliced
 * by the taper at the bottom.
 */
const SHIELD =
  "polygon(5% 0%, 95% 0%, 100% 4%, 100% 86%, 96% 92%, 84% 97%, 62% 99.5%, 50% 100%, 38% 99.5%, 16% 97%, 4% 92%, 0% 86%, 0% 4%)";

/** Height band that remains completely inside the shield's full-width area. */
const CONTENT_BAND = "h-[84%]";

const tiers = {
  gold: {
    rim: "linear-gradient(160deg,#fef3c7 0%,#f59e0b 20%,#78350f 46%,#fcd34d 64%,#92400e 86%,#fbbf24 100%)",
    fill: "linear-gradient(165deg,#3a2708 0%,#1c1307 42%,#0a0805 100%)",
    halo: "radial-gradient(130% 78% at 50% 2%,rgba(251,191,36,0.34) 0%,rgba(251,191,36,0) 64%)",
    stripes: "rgba(253,230,138,0.10)",
    number: "text-amber-50",
    accent: "text-amber-300",
  },
  silver: {
    rim: "linear-gradient(160deg,#f8fafc 0%,#cbd5e1 20%,#475569 46%,#e2e8f0 64%,#64748b 86%,#cbd5e1 100%)",
    fill: "linear-gradient(165deg,#1e293b 0%,#131a26 42%,#080b12 100%)",
    halo: "radial-gradient(130% 78% at 50% 2%,rgba(226,232,240,0.26) 0%,rgba(226,232,240,0) 64%)",
    stripes: "rgba(226,232,240,0.09)",
    number: "text-slate-50",
    accent: "text-slate-200",
  },
  bronze: {
    rim: "linear-gradient(160deg,#fed7aa 0%,#c2703c 22%,#5c2f14 48%,#fdba74 66%,#7c3d17 88%,#d08a4e 100%)",
    fill: "linear-gradient(165deg,#331a0d 0%,#1c0f07 42%,#0a0503 100%)",
    halo: "radial-gradient(130% 78% at 50% 2%,rgba(251,146,60,0.28) 0%,rgba(251,146,60,0) 64%)",
    stripes: "rgba(254,215,170,0.09)",
    number: "text-orange-50",
    accent: "text-orange-300",
  },
} as const;

export type PlayerCardProps = {
  name: string;
  image?: string | null;
  position: Position;
  ovr: number | null;
  jerseyNumber?: number | null;
  captain?: boolean;
  scores?: AttributeScores | null;
  ratingCount?: number;
  className?: string;
};

export function PlayerCard({
  name,
  image,
  position,
  ovr,
  jerseyNumber,
  captain = false,
  scores = null,
  ratingCount = 0,
  className,
}: PlayerCardProps) {
  const tier = tiers[ratingTier(ovr ?? 0)];
  const overall = ovr === null ? "—" : Math.round(ovr);
  // Rating averages only exist once the community has voted.
  const rated: AttributeScores | null = ratingCount > 0 ? scores : null;

  return (
    <figure
      className={cn(
        "group relative aspect-[5/7] w-full max-w-[17rem] transition-[transform,filter] duration-300 hover:-translate-y-2 hover:drop-shadow-[0_0_30px_rgba(255,215,0,0.15)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      style={{ containerType: "inline-size" }}
    >
      {/* Hover aura sits behind the rim so the card appears to lift and glow. */}
      <div
        aria-hidden
        className="absolute -inset-3 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ backgroundImage: tier.halo }}
      />
      {/* Layer 1 — metallic rim (clipped, decorative only). */}
      <div aria-hidden className="absolute inset-0" style={{ clipPath: SHIELD, background: tier.rim }} />
      {/* Layer 2 — inner face (clipped, decorative only). */}
      <div aria-hidden className="absolute inset-[0.9cqw]" style={{ clipPath: SHIELD, background: tier.fill }}>
        <div className="absolute inset-0" style={{ backgroundImage: tier.halo }} />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(115deg, ${tier.stripes} 0 1.5cqw, transparent 1.5cqw 5cqw)`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[38%]"
          style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.14),transparent)" }}
        />
      </div>
      {/* Layer 3 — content. Deliberately NOT clipped and confined to the
          shield's full-width band, so no text can be cut by the taper. */}
      <div className={cn("relative flex flex-col justify-between px-[8%] pt-[7%] pb-[2%]", CONTENT_BAND)}>
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-center">
            <span className={cn("font-mono text-[13cqw] leading-[0.85] font-extrabold tabular-nums drop-shadow-[0_0.15cqw_0.4cqw_rgba(0,0,0,0.6)]", tier.number)}>
              {overall}
            </span>
            {/* Tight against the OVR so the pair reads as one block. */}
            <span className={cn("-mt-[0.2cqw] text-[4.4cqw] leading-none font-bold tracking-[0.12em]", tier.accent)}>
              {position}
            </span>
          </div>
          {jerseyNumber != null && (
            <span className="flex size-[9cqw] items-center justify-center rounded-[1.6cqw] border border-white/25 bg-black/35 font-mono text-[5cqw] font-bold text-white/90 backdrop-blur-sm">
              {jerseyNumber}
            </span>
          )}
        </div>

        <div className="flex justify-center">
          {/* Recessed stage instead of a thick grey photo frame. */}
          <div className="relative flex size-[36cqw] items-center justify-center rounded-full bg-black/35 shadow-[inset_0_0_0_0.8cqw_rgba(255,255,255,0.07)]">
            <PlayerAvatar
              name={name}
              image={image}
              className="size-[30cqw] border-0 shadow-[0_0.6cqw_1.6cqw_rgba(0,0,0,0.55)]"
            />
          </div>
        </div>

        <div className="space-y-[1.6cqw]">
          <div className="border-b border-white/10 pb-[1.2cqw]">
            <p className={cn("flex items-center justify-center gap-[1.2cqw] text-[5.2cqw] leading-tight font-bold tracking-[0.06em] uppercase", tier.number)}>
              {captain && <Crown aria-hidden className="size-[5cqw] shrink-0 text-amber-300" />}
              <span className="truncate">{name}</span>
            </p>
            <p className="mt-[0.4cqw] text-center text-[3.2cqw] leading-none font-medium text-white/60">
              {positionLabels[position]} · {rated ? `${ratingCount} oy` : "oy yok"}
            </p>
          </div>

          {/* EA FC style matrix: three columns split by hairline dividers. */}
          <div className="grid grid-cols-3">
            {ratingAttributes.map((attribute, index) => (
              <div
                key={attribute.key}
                className={cn(
                  "flex flex-col items-center justify-center gap-[0.4cqw] py-[1.2cqw]",
                  // Divider between columns only: skip it at the end of each row.
                  (index + 1) % 3 !== 0 && "border-r border-white/10",
                )}
              >
                <span className="flex items-baseline gap-[0.8cqw]">
                  <span
                    className={cn(
                      "font-mono text-[6.2cqw] leading-none font-extrabold tabular-nums",
                      rated ? tier.number : "text-white/30",
                    )}
                  >
                    {rated ? Math.round(rated[attribute.key]) : "—"}
                  </span>
                  <span className="text-[3.2cqw] leading-none font-semibold tracking-[0.08em] text-white/55">
                    {attribute.code}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="sr-only">
        {name}, {position}, genel reyting {overall}. Toplam {ratingCount} değerlendirme.
        {rated
          ? ratingAttributes.map((attribute) => ` ${attribute.label} ${Math.round(rated[attribute.key])}`).join(",")
          : " Henüz değerlendirme yok."}
      </figcaption>
    </figure>
  );
}