import "server-only";
import { prisma } from "@/lib/prisma";
import { getCrewOvr } from "@/lib/crew-ovr";
import type { AttributeScores } from "@/lib/rating";

const ZERO_SCORES: AttributeScores = { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 };

/**
 * The ACTIVE crew's six-attribute verdict for one player, shaped for the
 * read-only RatingSummary and PlayerCard.
 *
 * This replaced the old global PlayerRating aggregate: stats are a crew-scoped
 * fact now, so a viewer always sees the workspace crew's opinion. count 0 with
 * a null OVR means "this crew has not voted yet" and the UI says so explicitly
 * instead of pretending the zeros are grades.
 */
export async function getCrewRatingSummary(crewId: string | null, targetUserId: string): Promise<{
  scores: AttributeScores;
  count: number;
  /** Derived crew OVR, or null while this crew has cast no votes. */
  ovr: number | null;
}> {
  if (!crewId) return { scores: ZERO_SCORES, count: 0, ovr: null };
  const membership = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId: targetUserId } },
    select: { id: true },
  });
  if (!membership) return { scores: ZERO_SCORES, count: 0, ovr: null };
  const entry = (await getCrewOvr(prisma, crewId, [targetUserId])).get(targetUserId);
  if (!entry || entry.isUnrated || entry.scores === null || entry.ovrRating === null) {
    return { scores: ZERO_SCORES, count: 0, ovr: null };
  }
  return { scores: entry.scores, count: entry.voteCount, ovr: entry.ovrRating };
}