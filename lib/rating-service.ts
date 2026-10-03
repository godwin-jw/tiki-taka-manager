import type { PrismaClient } from "@prisma/client";
import { averageScores, overallRating, parseRating } from "./rating.ts";
import { text, ValidationError } from "./validation.ts";

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