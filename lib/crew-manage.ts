import type { PrismaClient } from "@prisma/client";
import { CrewError } from "./crew-error.ts";
import { normalizeCrewName, text } from "./validation.ts";

/** The transactional client Prisma hands to a `$transaction` callback. */
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type LockedCrew = { id: string; name: string; ownerId: string };

/** Trim and collapse whitespace, so "Kartal  SK " and "Kartal SK" compare equal. */
const squash = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Reads the crew under a row lock (`FOR UPDATE`).
 *
 * The lock is what makes rename/delete safe against concurrent writers: a match
 * insert or vote references the crew through a foreign key, which needs a
 * `KEY SHARE` lock on this very row, so it waits for us and then fails cleanly
 * once the crew is gone instead of attaching itself to a deleted crew. Two
 * simultaneous deletes serialise here too, and the loser sees "not found".
 */
async function lockCrew(tx: Tx, crewId: string): Promise<LockedCrew> {
  const rows = await tx.$queryRaw<LockedCrew[]>`SELECT "id", "name", "ownerId" FROM "Crew" WHERE "id" = ${crewId} FOR UPDATE`;
  const crew = rows[0];
  if (!crew) throw new CrewError("Ekip bulunamadı veya zaten silinmiş.");
  return crew;
}

/** Only the crew's OWNER passes. Captains and co-captains manage matches, never the crew itself. */
async function assertOwner(tx: Tx, crewId: string, actorId: string, message: string) {
  const membership = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: actorId } }, select: { role: true } });
  if (membership?.role !== "OWNER") throw new CrewError(message);
}

/**
 * Renames a crew. OWNER only.
 *
 * Authority and uniqueness are decided inside the transaction, under the crew
 * row lock, so a stale page cannot rename a crew the actor no longer owns. The
 * name follows exactly the creation rules (3-40 characters, repeated spaces
 * collapsed, unique ignoring case). Changing only the capitalisation of the
 * crew's own name is allowed.
 *
 * Name uniqueness is enforced here, not by a database index (createCrew works
 * the same way), so two truly simultaneous requests for one new name are not
 * serialised against each other.
 */
export async function renameCrewByOwner(db: PrismaClient, actorId: string, crewId: unknown, newName: unknown) {
  const id = text(crewId, "Ekip", 1, 100);
  const name = normalizeCrewName(newName);
  return db.$transaction(async (tx) => {
    const crew = await lockCrew(tx, id);
    await assertOwner(tx, id, actorId, "Yalnızca ekibin kurucusu ekibi yeniden adlandırabilir.");
    if (crew.name === name) return { id, name, changed: false };
    const duplicate = await tx.crew.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (duplicate) throw new CrewError("Bu isimde bir ekip zaten var.");
    await tx.crew.update({ where: { id }, data: { name } });
    return { id, name, changed: true };
  });
}

/**
 * Permanently deletes a crew and everything that only exists because of it.
 * OWNER only, and the caller must repeat the crew's exact name.
 *
 * Why this is more than `crew.delete()`: `Match.crewId` is `ON DELETE SET NULL`,
 * so a plain delete would leave the crew's matches behind as crew-less rows that
 * leak into the global archive, and every reported match would keep the goals,
 * assists and MOTMs it granted. Instead, in ONE transaction:
 *
 *  1. lock the crew row, then its matches (a concurrent report waits, then fails);
 *  2. check the actor is the OWNER and the typed name matches, server-side, so a
 *     hand-crafted call cannot skip the UI confirmation;
 *  3. rewind the career (GlobalPlayerProfile) and season (PlayerSeasonStat)
 *     counters of every REPORTED match, exactly like deleteGlobalMatch does for a
 *     single match - never below zero, never for unreported matches (they never
 *     moved a counter);
 *  4. delete the matches (MatchPlayer rows cascade), votes, invitations, join
 *     requests and memberships EXPLICITLY, so correctness never depends on every
 *     foreign key being CASCADE in the deployed database, then the crew itself.
 *
 * Accounts, player profiles, seasons and the stats earned in other crews or in
 * global matches are untouched. Any failure rolls the whole thing back.
 */
export async function deleteCrewByOwner(db: PrismaClient, actorId: string, crewId: unknown, confirmName: unknown) {
  const id = text(crewId, "Ekip", 1, 100);
  return db.$transaction(async (tx) => {
    const crew = await lockCrew(tx, id);
    await assertOwner(tx, id, actorId, "Yalnızca ekibin kurucusu ekibi silebilir.");
    if (typeof confirmName !== "string" || squash(confirmName) !== squash(crew.name)) {
      throw new CrewError("Silmeyi onaylamak için ekibin adını tam olarak yazmalısın.");
    }

    // Freeze the crew's matches so a report cannot land between rewind and delete.
    await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "crewId" = ${id} FOR UPDATE`;

    // Career counters: one UPDATE, grouped per player across all reported matches.
    await tx.$executeRaw`
      UPDATE "GlobalPlayerProfile" AS p
      SET "goals" = GREATEST(0, p."goals" - s."goals"),
          "assists" = GREATEST(0, p."assists" - s."assists"),
          "matchesPlayed" = GREATEST(0, p."matchesPlayed" - s."played"),
          "motmCount" = GREATEST(0, p."motmCount" - s."motm"),
          "updatedAt" = NOW()
      FROM (
        SELECT mp."playerProfileId" AS "profileId",
               SUM(mp."goals")::int AS "goals",
               SUM(mp."assists")::int AS "assists",
               COUNT(*)::int AS "played",
               SUM(CASE WHEN mp."isMotm" THEN 1 ELSE 0 END)::int AS "motm"
        FROM "MatchPlayer" mp
        JOIN "Match" m ON m."id" = mp."matchId"
        WHERE m."crewId" = ${id} AND m."reportedAt" IS NOT NULL
        GROUP BY mp."playerProfileId"
      ) s
      WHERE p."id" = s."profileId"
    `;
    // Season lines were incremented in the same transaction as the career lines,
    // so they are rewound per (season, player) in lockstep.
    await tx.$executeRaw`
      UPDATE "PlayerSeasonStat" AS st
      SET "goals" = GREATEST(0, st."goals" - s."goals"),
          "assists" = GREATEST(0, st."assists" - s."assists"),
          "matchesPlayed" = GREATEST(0, st."matchesPlayed" - s."played"),
          "motmCount" = GREATEST(0, st."motmCount" - s."motm"),
          "updatedAt" = NOW()
      FROM (
        SELECT m."seasonId" AS "seasonId",
               mp."playerProfileId" AS "profileId",
               SUM(mp."goals")::int AS "goals",
               SUM(mp."assists")::int AS "assists",
               COUNT(*)::int AS "played",
               SUM(CASE WHEN mp."isMotm" THEN 1 ELSE 0 END)::int AS "motm"
        FROM "MatchPlayer" mp
        JOIN "Match" m ON m."id" = mp."matchId"
        WHERE m."crewId" = ${id} AND m."reportedAt" IS NOT NULL AND m."seasonId" IS NOT NULL
        GROUP BY m."seasonId", mp."playerProfileId"
      ) s
      WHERE st."seasonId" = s."seasonId" AND st."playerProfileId" = s."profileId"
    `;


    // Children first, then the crew. Matches go before the crew because
    // Match.crewId is SET NULL: deleting the crew first would orphan them.
    const matches = await tx.match.deleteMany({ where: { crewId: id } });
    await tx.playerRatingVote.deleteMany({ where: { crewId: id } });
    await tx.crewInvitation.deleteMany({ where: { crewId: id } });
    await tx.crewRequest.deleteMany({ where: { crewId: id } });
    const members = await tx.crewMember.deleteMany({ where: { crewId: id } });
    await tx.crew.delete({ where: { id } });
    return { id, name: crew.name, matchesDeleted: matches.count, membersRemoved: members.count };
  }, { maxWait: 10_000, timeout: 30_000 });
}

