// Season-facing reads for a single player. The crew leaderboard lives in
// crew-leaders.ts so it can be exercised with an injected Prisma client.
import "server-only";

import { prisma } from "@/lib/prisma";

/** All seasons, newest first, plus which one is currently live. */
export async function listSeasons() {
  return prisma.season.findMany({
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
  });
}

export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true, startDate: true, endDate: true } });
}

/**
 * Per-season line for one player.
 *
 * Returns null when the player has no row for that season, so the UI can render
 * a real empty state instead of showing a misleading row of zeroes.
 */
export async function getSeasonStat(playerProfileId: string, seasonId: string) {
  return prisma.playerSeasonStat.findUnique({
    where: { seasonId_playerProfileId: { seasonId, playerProfileId } },
    select: { ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true },
  });
}

export type SeasonTimelineEntry = {
  seasonId: string;
  seasonName: string;
  isActive: boolean;
  /** True when the season has no stored row for this player. */
  isEmpty: boolean;
} & NonNullable<Awaited<ReturnType<typeof getSeasonStat>>>;

/**
 * Every season with this player's line, so the profile can show a full history
 * and mark which seasons they never played.
 */
export async function getSeasonTimeline(playerProfileId: string): Promise<SeasonTimelineEntry[]> {
  const seasons = await listSeasons();
  if (seasons.length === 0) return [];
  const rows = await prisma.playerSeasonStat.findMany({
    where: { playerProfileId, seasonId: { in: seasons.map((season) => season.id) } },
    select: { seasonId: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true },
  });
  const bySeason = new Map(rows.map((row) => [row.seasonId, row]));
  return seasons.flatMap((season) => {
    const row = bySeason.get(season.id);
    if (!row) return [];
    return [{ ...row, seasonId: season.id, seasonName: season.name, isActive: season.isActive, isEmpty: false }];
  });
}
