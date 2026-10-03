import "server-only";
import { prisma } from "@/lib/prisma";
import { averageScores } from "@/lib/rating";

export async function getRatingSummary(playerProfileId: string) {
  const summary = await prisma.playerRating.aggregate({ where: { playerProfileId }, _count: true,
    _avg: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true } });
  return { count: summary._count, scores: averageScores(summary._avg) };
}