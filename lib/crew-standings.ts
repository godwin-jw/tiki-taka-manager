import type { PrismaClient } from "@prisma/client";

export type CrewStandingRow = {
  userId: string;
  name: string;
  position: string;
  ovrRating: number;
  /** True when this crew has not rated the player; ovrRating is then a seed value. */
  isUnrated?: boolean;
  goals: number;
  assists: number;
  matchesPlayed: number;
  motmCount: number;
};

/**
 * Aggregates a crew's own results for one season.
 *
 * Isolation is the whole point of this function. The per-season line on
 * PlayerSeasonStat is platform-wide, so it also contains goals scored in other
 * crews and in global matches. Summing it would leak those results into this
 * crew's table, so the totals are rebuilt from the MatchPlayer rows that belong
 * to matches of THIS crew and THIS season. A player with no appearance here is
 * reported as zero rather than inheriting their outside numbers.
 *
 * The client is injected so this can be exercised against a real database in
 * tests, matching the shape of match-service and rating-service.
 */
export async function aggregateCrewStandings(
  db: PrismaClient,
  crewId: string,
  seasonId: string,
  profileIds: readonly string[],
): Promise<Map<string, { goals: number; assists: number; matchesPlayed: number; motmCount: number }>> {
  const totals = new Map<string, { goals: number; assists: number; matchesPlayed: number; motmCount: number }>();
  if (profileIds.length === 0) return totals;

  const scoped = await db.matchPlayer.groupBy({
    by: ["playerProfileId"],
    where: { playerProfileId: { in: [...profileIds] }, match: { crewId, seasonId } },
    _sum: { goals: true, assists: true },
    _count: { _all: true },
  });
  const motmRows = await db.matchPlayer.findMany({
    where: { playerProfileId: { in: [...profileIds] }, isMotm: true, match: { crewId, seasonId } },
    select: { playerProfileId: true },
  });
  const motmByProfile = new Map<string, number>();
  for (const row of motmRows) motmByProfile.set(row.playerProfileId, (motmByProfile.get(row.playerProfileId) ?? 0) + 1);

  for (const row of scoped) {
    totals.set(row.playerProfileId, {
      goals: row._sum.goals ?? 0,
      assists: row._sum.assists ?? 0,
      matchesPlayed: row._count._all,
      motmCount: motmByProfile.get(row.playerProfileId) ?? 0,
    });
  }
  return totals;
}