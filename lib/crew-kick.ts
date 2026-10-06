import type { PrismaClient } from "@prisma/client";
import { canManageCrew } from "./football.ts";

export class CrewError extends Error {}

/**
 * Removes a member from a crew, at the request of an OWNER or CAPTAIN.
 *
 * Guards, all re-checked inside the transaction so a stale client cannot remove
 * somebody the actor no longer manages:
 *  - the actor must hold OWNER or CAPTAIN in this crew;
 *  - nobody may remove themselves (leaveCrew applies its own OWNER rule);
 *  - the crew's OWNER can never be removed, not even by another captain;
 *  - captains and co-captains are officers: only the OWNER may remove one, so a
 *    captain can never eject a CO_CAPTAIN either. The owner may remove any
 *    officer, so a crew can never end up with a captain nobody can remove.
 *
 * Deleting the CrewMember row is the whole effect. The account and every
 * PlayerSeasonStat / MatchPlayer row survive: kicking someone must never rewrite
 * match history or refund the goals they scored.
 *
 * Their votes in this crew go too, because a vote only means something while both
 * people are in the crew it was cast for. Votes they cast in OTHER crews are kept.
 */
export async function kickCrewMember(db: PrismaClient, actorId: string, crewId: string, targetUserId: string) {
  return db.$transaction(async (tx) => {
    const actor = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: actorId } }, select: { role: true } });
    if (!canManageCrew(actor?.role)) throw new CrewError("Yalnızca ekip kaptanı üye çıkarabilir.");
    if (actorId === targetUserId) throw new CrewError("Kendini ekibinden çıkaramazsın.");

    const target = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: targetUserId } }, select: { id: true, role: true } });
    if (!target) throw new CrewError("Bu oyuncu bu ekibin üyesi değil.");
    if (target.role === "OWNER") throw new CrewError("Ekip sahibi ekipten çıkarılamaz.");
    if ((target.role === "CAPTAIN" || target.role === "CO_CAPTAIN") && actor?.role !== "OWNER") throw new CrewError("Yalnızca kurucu bir kaptanı veya kaptan yardımcısını çıkarabilir.");

    await tx.crewMember.delete({ where: { id: target.id } });
    // Votes cast by or for this player in this crew stop applying immediately.
    await tx.playerRatingVote.deleteMany({ where: { crewId, OR: [{ voterId: targetUserId }, { targetUserId }] } });
    await tx.crewInvitation.deleteMany({ where: { crewId, receiverId: targetUserId, status: "PENDING" } });
    return { crewId, userId: targetUserId };
  });
}