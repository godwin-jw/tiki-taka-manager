import type { PrismaClient } from "@prisma/client";
import { getCrewOvr, DEFAULT_CREW_OVR } from "./crew-ovr.ts";
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
  // The crew header and its member list do not depend on each other.
  const [crew, members] = await Promise.all([
    db.crew.findUnique({ where: { id: crewId }, select: { id: true, name: true } }),
    db.crewMember.findMany({
      where: { crewId },
      select: { user: { select: { id: true, name: true, playerProfile: { select: { id: true, position: true } } } } },
    }),
  ]);
  if (!crew) return null;
  const profileIds = members.map(m => m.user.playerProfile?.id).filter((id): id is string => Boolean(id));
  if (profileIds.length === 0) return { id: crew.id, name: crew.name, rows: [] as CrewStandingRow[] };

  // The member query already pairs every user with their profile, so the OVR is
  // read by user id directly (getCrewOvrByProfile would look the pairs up again),
  // and it runs alongside the season totals.
  const [totals, ovrByUser] = await Promise.all([
    aggregateCrewStandings(db, crewId, seasonId, profileIds),
    getCrewOvr(db, crewId, members.filter(m => m.user.playerProfile).map(m => m.user.id)),
  ]);

  const rows = members.flatMap((member): CrewStandingRow[] => {
    const profile = member.user.playerProfile;
    if (!profile) return [];
    const scoped = totals.get(profile.id);
    const contextual = ovrByUser.get(member.user.id);
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