import type { PrismaClient } from "@prisma/client";
import { getCrewOvrByProfile, DEFAULT_CREW_OVR } from "./crew-ovr.ts";
import { aggregateCrewStandings, type CrewStandingRow } from "./crew-standings.ts";

/**
 * Crew-wide standings for one season, restricted to crew members.
 *
 * Two independent scopes are applied and both matter:
 *  - the member list is crew-scoped, so a non-member never appears;
 *  - the statistics are rebuilt from this crew's own MatchPlayer rows, so results
 *    earned in another crew (or a global match) cannot leak into the table.
 *
 * The OVR is contextual too: it is the average of the votes cast in THIS crew,
 * never the platform-wide profile column.
 *
 * The client is injected so the isolation rules can be exercised against a real
 * database, matching match-service, rating-service and crew-standings.
 */
export async function getCrewSeasonLeaders(db: PrismaClient, crewId: string, seasonId: string) {
  const crew = await db.crew.findUnique({ where: { id: crewId }, select: { id: true, name: true } });
  if (!crew) return null;

  const members = await db.crewMember.findMany({
    where: { crewId },
    select: { user: { select: { id: true, name: true, playerProfile: { select: { id: true, position: true } } } } },
  });
  const profileIds = members.map(m => m.user.playerProfile?.id).filter((id): id is string => Boolean(id));
  if (profileIds.length === 0) return { id: crew.id, name: crew.name, rows: [] as CrewStandingRow[] };

  const totals = await aggregateCrewStandings(db, crewId, seasonId, profileIds);
  const ovrByProfile = await getCrewOvrByProfile(db, crewId, profileIds);

  const rows = members.flatMap((member): CrewStandingRow[] => {
    const profile = member.user.playerProfile;
    if (!profile) return [];
    const scoped = totals.get(profile.id);
    const contextual = ovrByProfile.get(profile.id);
    return [{
      userId: member.user.id,
      name: member.user.name ?? "Oyuncu",
      position: profile.position,
      // Unrated in this crew: neutral seed, flagged so the UI can say so.
      ovrRating: contextual?.ovrRating ?? DEFAULT_CREW_OVR,
      isUnrated: contextual?.isUnrated ?? true,
      goals: scoped?.goals ?? 0,
      assists: scoped?.assists ?? 0,
      matchesPlayed: scoped?.matchesPlayed ?? 0,
      motmCount: scoped?.motmCount ?? 0,
    }];
  });

  return { id: crew.id, name: crew.name, rows };
}