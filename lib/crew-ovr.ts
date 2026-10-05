import { averagePeerVotes, clampOvr } from "./rating.ts";
import type { PrismaClient } from "@prisma/client";

/**
 * OVR shown for a player who has not been rated by this crew yet.
 *
 * Deliberately not 0: a fresh recruit should not look like the worst player on
 * the roster, and a snake draft would always seat them last. The UI also marks
 * these players as unrated so the number is never mistaken for a real verdict.
 */
export const DEFAULT_CREW_OVR = 75;

export type CrewOvrEntry = {
  /** The crew-scoped rating, or null when this crew has cast no votes yet. */
  ovrRating: number | null;
  /** How many distinct voters contributed. */
  voteCount: number;
  /** True when the crew has not rated this player at all. */
  isUnrated: boolean;
};

/**
 * Contextual OVR: the published rating of a player *inside one crew*.
 *
 * A player can belong to several crews, and a 90 in a top side says nothing about
 * how a lower side sees them. Deriving the number from the votes cast in this
 * crew keeps the two from bleeding into each other. When a player is unrated here
 * the value is null, so callers can show DEFAULT_CREW_OVR *and* a clear "not rated
 * yet" signal instead of silently borrowing another crew's opinion.
 *
 * Only the latest vote per voter counts, matching how a vote is re-cast.
 */
export async function getCrewOvr(
  db: PrismaClient,
  crewId: string,
  targetUserIds: readonly string[],
): Promise<Map<string, CrewOvrEntry>> {
  const result = new Map<string, CrewOvrEntry>();
  if (targetUserIds.length === 0) return result;
  // Give every requested player an unrated entry so callers never have to
  // distinguish "not a member" from "not rated".
  for (const userId of targetUserIds) {
    result.set(userId, { ovrRating: null, voteCount: 0, isUnrated: true });
  }

  const votes = await db.playerRatingVote.findMany({
    // crewId is the isolation boundary: a vote in another crew is invisible here.
    where: { crewId, targetUserId: { in: [...targetUserIds] } },
    select: { targetUserId: true, voterId: true, ovrRating: true, updatedAt: true },
  });
  if (votes.length === 0) return result;

  const byTarget = new Map<string, typeof votes>();
  for (const vote of votes) {
    const bucket = byTarget.get(vote.targetUserId);
    if (bucket) bucket.push(vote);
    else byTarget.set(vote.targetUserId, [vote]);
  }

  for (const [userId, bucket] of byTarget) {
    const average = averagePeerVotes(bucket);
    if (average === null) continue;
    result.set(userId, { ovrRating: clampOvr(average), voteCount: new Set(bucket.map(v => v.voterId)).size, isUnrated: false });
  }
  return result;
}

/**
 * Same as getCrewOvr but keyed by player profile id, for the match builder and
 * the crew leaderboards which work in profile space.
 *
 * Resolving user ids inside the same query set keeps the two mappings in step.
 */
export async function getCrewOvrByProfile(
  db: PrismaClient,
  crewId: string,
  profileIds: readonly string[],
): Promise<Map<string, CrewOvrEntry>> {
  const result = new Map<string, CrewOvrEntry>();
  if (profileIds.length === 0) return result;
  for (const id of profileIds) result.set(id, { ovrRating: null, voteCount: 0, isUnrated: true });

  const profiles = await db.playerProfile.findMany({
    where: { id: { in: [...profileIds] } },
    select: { id: true, userId: true },
  });
  const userIdToProfile = new Map(profiles.map(p => [p.userId, p.id]));
  const byUser = await getCrewOvr(db, crewId, profiles.map(p => p.userId));
  for (const [userId, entry] of byUser) {
    const profileId = userIdToProfile.get(userId);
    if (profileId) result.set(profileId, entry);
  }
  return result;
}
