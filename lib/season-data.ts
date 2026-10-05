import "server-only";

import { prisma } from "@/lib/prisma";
import { aggregateCrewStandings } from "@/lib/crew-standings";

/** All seasons, newest first, plus which one is currently live. */
export async function listSeasons() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
  });
  return seasons;
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

/**
 * Crew-wide standings for the given season, restricted to crew members.
 *
 * Isolation: the member list AND the statistics are both crew-scoped. A player's
 * season line can contain results from matches played in other crews, so those
 * are filtered out by requiring the underlying match to belong to this crew.
 * Counting every season row would leak another crew's scorers into this table.
 */
export async function getCrewSeasonLeaders(crewId: string, seasonId: string) {
  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    select: { id: true, name: true },
  });
  if (!crew) return null;

  const members = await prisma.crewMember.findMany({
    where: { crewId },
    select: { user: { select: { id: true, name: true, playerProfile: { select: { id: true, ovrRating: true, position: true } } } } },
  });
  const profileIds = members.map((member) => member.user.playerProfile?.id).filter((id): id is string => Boolean(id));
  if (profileIds.length === 0) return { id: crew.id, name: crew.name, rows: [] };

  // Aggregate this crew's own match rows instead of trusting the platform-wide
  // season line, so nothing from another crew (or a global match) can surface.
  const totals = await aggregateCrewStandings(prisma, crewId, seasonId, profileIds);

  const rows = members.flatMap((member) => {
    const profile = member.user.playerProfile;
    if (!profile) return [];
    const scoped = totals.get(profile.id);
    return [{
      userId: member.user.id,
      name: member.user.name ?? "Oyuncu",
      position: profile.position,
      // OVR is the crew-vote published value; never another crew's tally.
      ovrRating: profile.ovrRating,
      goals: scoped?.goals ?? 0,
      assists: scoped?.assists ?? 0,
      matchesPlayed: scoped?.matchesPlayed ?? 0,
      motmCount: scoped?.motmCount ?? 0,
    }];
  });

  return { id: crew.id, name: crew.name, rows };
}