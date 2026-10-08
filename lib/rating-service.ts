import type { PrismaClient } from "@prisma/client";
import { averagePeerStats, clampOvr, overallRating, parseRating } from "./rating.ts";
import { text, ValidationError } from "./validation.ts";

/** The transactional client Prisma hands to a `$transaction` callback. */
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Returns this crew's derived OVR without overwriting the global profile seed. */
export async function publishPeerOvr(tx: Tx, targetUserId: string, crewId: string) {
  const votes = await tx.playerRatingVote.findMany({
    where: { targetUserId, crewId },
    select: { voterId: true, pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true, updatedAt: true },
  });
  const average = averagePeerStats(votes);
  return average === null ? null : clampOvr(overallRating(average.scores));
}

/**
 * Records (or refreshes) one peer's OVR vote inside a crew.
 *
 * Security rules, all enforced server-side inside the transaction:
 *  - the voter must be an authenticated user;
 *  - nobody may vote for themselves;
 *  - voter and target must BOTH hold an active membership in the same crew, so a
 *    vote can never cross crew boundaries;
 *  - each of the six attributes must be an integer 0-99 (parseRating).
 *
 * Re-casting updates the same row, so a player cannot inflate their average by
 * submitting repeatedly.
 */
export async function castPeerVote(db: PrismaClient, voterId: string, crewId: unknown, targetUserId: unknown, input: unknown) {
  const crew = text(crewId, "Ekip", 1, 100);
  const target = text(targetUserId, "Oyuncu", 1, 100);
  // The full six-attribute ballot; rejects anything outside 0-99 integers.
  const scores = parseRating(input);
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
    const profiles = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "GlobalPlayerProfile" WHERE "userId" = ${target} FOR UPDATE`;
    if (profiles.length === 0) throw new ValidationError("Oyuncu profili bulunamadı.");

    await tx.playerRatingVote.upsert({
      where: { crewId_voterId_targetUserId: { crewId: crew, voterId, targetUserId: target } },
      create: { crewId: crew, voterId, targetUserId: target, ...scores },
      update: scores,
    });

    // Scoped to this crew so one crew's verdict never overwrites another's.
    const published = await publishPeerOvr(tx, target, crew);
    return { ovrRating: published ?? clampOvr(overallRating(scores)) };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 20_000 });
}
