import type { PrismaClient } from "@prisma/client";
import { averagePeerVotes, averageScores, clampOvr, overallRating, parseRating } from "./rating.ts";
import { integer, text, ValidationError } from "./validation.ts";

/** The transactional client Prisma hands to a `$transaction` callback. */
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Publishes a player's OVR from their crew votes and returns it.
 *
 * The average is taken from the votes of ONE crew: a player shared by several
 * crews is rated independently in each, and only this crew's opinion is written
 * back to the profile. Without the crew filter, the last crew to vote would
 * silently overwrite the others' verdicts on a single global column.
 *
 * PlayerProfile.ovrRating therefore becomes a "no crew has rated them yet" seed
 * rather than the published value. Every crew-scoped read path goes through
 * getCrewOvr instead, so the profile, the roster, the match builder and the
 * leaderboards cannot disagree about a crew's OVR.
 */
export async function publishPeerOvr(tx: Tx, targetUserId: string, crewId: string) {
  const votes = await tx.playerRatingVote.findMany({
    where: { targetUserId, crewId },
    select: { voterId: true, ovrRating: true, updatedAt: true },
  });
  const average = averagePeerVotes(votes);
  const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { playerProfile: { select: { id: true } } } });
  // No votes in this crew yet: leave the profile's seed OVR alone rather than
  // resetting a real rating to zero.
  if (average === null || !target?.playerProfile) return null;
  const ovrRating = clampOvr(average);
  await tx.playerProfile.update({ where: { id: target.playerProfile.id }, data: { ovrRating } });
  return ovrRating;
}

/**
 * Records (or refreshes) one peer's OVR vote inside a crew.
 *
 * Security rules, all enforced server-side inside the transaction:
 *  - the voter must be an authenticated user;
 *  - nobody may vote for themselves;
 *  - voter and target must BOTH hold an active membership in the same crew, so a
 *    vote can never cross crew boundaries;
 *  - the score must be an integer 0-99.
 *
 * Re-casting updates the same row, so a player cannot inflate their average by
 * submitting repeatedly.
 */
export async function castPeerVote(db: PrismaClient, voterId: string, crewId: unknown, targetUserId: unknown, value: unknown) {
  const crew = text(crewId, "Ekip", 1, 100);
  const target = text(targetUserId, "Oyuncu", 1, 100);
  const ovrRating = integer(value, "OVR puanı", 0, 99);
  if (target === voterId) throw new ValidationError("Kendine oy veremezsin.");

  return db.$transaction(async (tx) => {
    if (!await tx.user.findUnique({ where: { id: voterId }, select: { id: true } })) throw new ValidationError("Geçerli bir kullanıcı oturumu gerekiyor.");

    // One query, both memberships: the pair must share this exact crew.
    const shared = await tx.crewMember.findMany({
      where: { crewId: crew, OR: [{ userId: voterId }, { userId: target }] },
      select: { userId: true },
    });
    const userIds = new Set(shared.map((row) => row.userId));
    if (!userIds.has(voterId) || !userIds.has(target)) throw new ValidationError("Yalnızca aynı ekibin üyeleri birbirine oy verebilir.");

    // Serialises competing votes before the average is recomputed.
    await tx.$queryRaw`SELECT "id" FROM "GlobalPlayerProfile" WHERE "userId" = ${target} FOR UPDATE`;

    await tx.playerRatingVote.upsert({
      where: { crewId_voterId_targetUserId: { crewId: crew, voterId, targetUserId: target } },
      create: { crewId: crew, voterId, targetUserId: target, ovrRating },
      update: { ovrRating },
    });

    // Scoped to this crew so one crew's verdict never overwrites another's.
    const published = await publishPeerOvr(tx, target, crew);
    return { ovrRating: published ?? ovrRating };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 20_000 });
}

// Internal service: raterId must come from the authenticated session, not the form.
export async function ratePlayer(db: PrismaClient, raterId: string, targetId: unknown, input: unknown) {
  const playerProfileId = text(targetId, "Oyuncu", 1, 100);
  const scores = parseRating(input);
  return db.$transaction(async tx => {
    if (!await tx.user.findUnique({ where: { id: raterId }, select: { id: true } })) throw new ValidationError("Geçerli bir kullanıcı oturumu gerekiyor.");
    // Lock the target before upsert/aggregate. Concurrent voters cannot publish stale averages.
    const profiles = await tx.$queryRaw<{ id: string; userId: string }[]>`
      SELECT "id", "userId" FROM "GlobalPlayerProfile" WHERE "id" = ${playerProfileId} FOR UPDATE
    `;
    const profile = profiles[0];
    if (!profile) throw new ValidationError("Oyuncu bulunamadı.");
    if (profile.userId === raterId) throw new ValidationError("Kendini değerlendiremezsin.");
    await tx.playerRating.upsert({
      where: { raterId_playerProfileId: { raterId, playerProfileId } },
      create: { raterId, playerProfileId, ...scores }, update: scores,
    });
    const summary = await tx.playerRating.aggregate({ where: { playerProfileId }, _count: true,
      _avg: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true } });
    const ovrRating = overallRating(averageScores(summary._avg));
    await tx.playerProfile.update({ where: { id: playerProfileId }, data: { ovrRating } });
    return { ovrRating, count: summary._count };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 20_000 });
}