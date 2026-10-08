import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createAuthAdapter } from "../lib/auth-adapter.ts";
import { createGlobalMatch, deleteGlobalMatch, reportGlobalMatch } from "../lib/match-service.ts";
import { castPeerVote } from "../lib/rating-service.ts";
import { aggregateCrewStandings } from "../lib/crew-standings.ts";
import { getCrewOvr, getCrewOvrByProfile } from "../lib/crew-ovr.ts";
import { getCrewSeasonLeaders } from "../lib/crew-leaders.ts";
import { kickCrewMember } from "../lib/crew-kick.ts";
import { deleteCrewByOwner, renameCrewByOwner } from "../lib/crew-manage.ts";
import { generateInviteCode, normalizeInviteCode } from "../lib/validation.ts";
import { CREW_MEMBER_LIMIT } from "../lib/football.ts";
import {
  acceptInvitation, getCrewByInviteCode, inviteUserToCrew, joinCrewByInviteCode, rejectInvitation, searchInvitableUsers,
} from "../lib/invitation-service.ts";

test("baseline upgrade, Google adapter, global profiles and match constraints", {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 120_000,
}, async () => {
  // Never migrate the supplied schema: provision and remove a unique test schema.
  const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const folder = mkdtempSync(path.join(tmpdir(), "tiki-auth-"));
  const migrations = path.join(folder, "migrations");
  mkdirSync(migrations);
  const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
  const migrate = () => execFileSync(process.execPath, [
    path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy",
    "--schema", path.join(folder, "schema.prisma"),
  ], { env, stdio: "pipe" });

  let createdSchema = false;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    cpSync("prisma/legacy.prisma", path.join(folder, "schema.prisma"));
    cpSync("prisma/migrations/migration_lock.toml", path.join(migrations, "migration_lock.toml"));
    cpSync("prisma/migrations/20260905000000_baseline", path.join(migrations, "20260905000000_baseline"), { recursive: true });
    migrate();
    await db.$executeRaw`INSERT INTO "User" (id, email, "updatedAt") VALUES ('legacy', 'legacy@example.com', NOW())`;
    await db.$executeRaw`INSERT INTO "Group" (id, name, "inviteCode", "captainId") VALUES ('group', 'Test', 'TEST01', 'legacy')`;
    await db.$executeRaw`INSERT INTO "PlayerProfile" (id, "userId", "groupId", goals, "ovrRating", positions) VALUES ('old-profile', 'legacy', 'group', 3, 81, '{"primary":"GK"}'::jsonb)`;
    await db.$executeRaw`INSERT INTO "Match" (id, date, "groupId", status, "isCompleted") VALUES ('old-match', NOW(), 'group', 'COMPLETED', true)`;
    cpSync("prisma/schema.prisma", path.join(folder, "schema.prisma"));
    cpSync("prisma/migrations/20260905010000_global_profiles_google_auth", path.join(migrations, "20260905010000_global_profiles_google_auth"), { recursive: true });
    cpSync("prisma/migrations/20261003000000_global_player_ratings", path.join(migrations, "20261003000000_global_player_ratings"), { recursive: true });
    migrate();
    // Crew/season tables must upgrade cleanly on top of the legacy data above.
    cpSync("prisma/migrations/20261010000000_crews_and_seasons", path.join(migrations, "20261010000000_crews_and_seasons"), { recursive: true });
    migrate();
    // Custom team names arrived after these rows, so simulate the messy states a
    // backfill has to repair: an empty name and a whitespace-only name.
    await db.$executeRaw`UPDATE "Match" SET "teamAName" = '', "teamBName" = '   ' WHERE id = 'old-match'`;
    cpSync("prisma/migrations/20261012000000_backfill_match_team_names", path.join(migrations, "20261012000000_backfill_match_team_names"), { recursive: true });
    migrate();

    // Peer voting table and the crew-scoped match index arrive on top of that.
    cpSync("prisma/migrations/20261013000000_crew_rating_votes_and_match_scoping", path.join(migrations, "20261013000000_crew_rating_votes_and_match_scoping"), { recursive: true });
    // Crews that predate this migration must come out of it with a *redeemable* code.
    // Asserting the join against normalizeInviteCode is the point: an earlier version
    // of this test checked the backfill against /^[0-9A-F]{8}$/, which passed while
    // every hex code containing 0, 1, 2, 5, 8 or B was rejected by the invite route.
    await db.$executeRaw`INSERT INTO "Crew" (id, name, "ownerId") VALUES ('pre-invite', 'Eski Ekip', 'legacy')`;
    cpSync("prisma/migrations/20261014000000_crew_invitations_and_invite_links", path.join(migrations, "20261014000000_crew_invitations_and_invite_links"), { recursive: true });
    migrate();
    const backfilled = await db.crew.findUniqueOrThrow({ where: { id: "pre-invite" } });
    assert.equal(normalizeInviteCode(backfilled.inviteCode), backfilled.inviteCode, "a backfilled code must be one the invite route accepts");
    assert.equal((await getCrewByInviteCode(db, backfilled.inviteCode))?.id, "pre-invite", "a backfilled link must resolve to its own crew");

    // The repair migration rewrites legacy hex codes, and the alphabet then becomes a
    // database invariant so no future write can produce an unredeemable link again.
    await db.$executeRaw`UPDATE "Crew" SET "inviteCode" = 'BCCB52FF' WHERE id = 'pre-invite'`;
    cpSync("prisma/migrations/20261015000000_repair_legacy_invite_codes", path.join(migrations, "20261015000000_repair_legacy_invite_codes"), { recursive: true });
    migrate();
    // GÖREV 4: the CO_CAPTAIN officer rank is a pure enum extension and must
    // upgrade cleanly on top of every earlier crew migration.
    cpSync("prisma/migrations/20261016000000_crew_co_captain_role", path.join(migrations, "20261016000000_crew_co_captain_role"), { recursive: true });
    migrate();
    // Crew stat ballots replace the single-number peer vote. A legacy vote is
    // planted first so the migration's backfill has something to convert: every
    // attribute must inherit the old number, losing no verdict.
    const bfVoter = await db.user.create({ data: { email: `bf-voter-${randomUUID()}@test.dev` } });
    const bfTarget = await db.user.create({ data: { email: `bf-target-${randomUUID()}@test.dev` } });
    const bfCrew = await db.crew.create({ data: { name: "Backfill", ownerId: bfVoter.id, inviteCode: generateInviteCode() } });
    await db.$executeRaw`INSERT INTO "PlayerRatingVote" ("id", "ovrRating", "updatedAt", "crewId", "voterId", "targetUserId") VALUES ('backfill-vote', 77, NOW(), ${bfCrew.id}, ${bfVoter.id}, ${bfTarget.id})`;
    cpSync("prisma/migrations/20261017000000_crew_stat_votes", path.join(migrations, "20261017000000_crew_stat_votes"), { recursive: true });
    migrate();
    const migratedVote = await db.playerRatingVote.findFirstOrThrow({ where: { crewId: bfCrew.id } });
    for (const attr of ["pace", "shooting", "passing", "dribbling", "defending", "physical"]) {
      assert.equal(migratedVote[attr], 77, `backfill must carry the old vote into ${attr}`);
    }
    const repaired = await db.crew.findUniqueOrThrow({ where: { id: "pre-invite" } });
    assert.notEqual(repaired.inviteCode, "BCCB52FF", "a hex code outside the alphabet must be replaced");
    assert.equal(normalizeInviteCode(repaired.inviteCode), repaired.inviteCode, "the repaired code must be redeemable");
    await assert.rejects(
      db.$executeRawUnsafe(`UPDATE "Crew" SET "inviteCode" = 'ABCDEFG0' WHERE id = 'pre-invite'`),
      /Crew_inviteCode_alphabet_check|violates check constraint/,
      "the database must reject a code outside the invite alphabet",
    );

    // Match reporting writes per-season lines, so the suite needs a live season.
    await db.season.create({ data: { name: "Test Season", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isActive: true } });

    const legacy = await db.user.findUniqueOrThrow({ where: { id: "legacy" }, include: { playerProfile: true, profiles: true } });
    assert.equal(legacy.role, "CAPTAIN");
    assert.equal(legacy.profiles.length, 1);
    assert.equal(legacy.playerProfile.goals, 3);
    assert.equal(legacy.playerProfile.position, "GK");
    const legacyMatch = await db.match.findUniqueOrThrow({ where: { id: "old-match" } });
    assert.equal(legacyMatch.status, "COMPLETED");
    // The backfill repairs blank and whitespace-only names on pre-existing rows.
    assert.equal(legacyMatch.teamAName, "A Tak\u0131m\u0131");
    assert.equal(legacyMatch.teamBName, "B Tak\u0131m\u0131");
    assert.equal(legacyMatch.seasonId, null);
    assert.equal(legacyMatch.crewId, null);

    const adapter = createAuthAdapter(db);
    const user = await adapter.createUser({ email: "google@example.com", emailVerified: null, name: "Player", image: null, role: "CAPTAIN" });
    assert.equal(user.role, "PLAYER");
    const profile = await db.playerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(profile.goals, 0);
    assert.equal(profile.position, "MID");
    await adapter.linkAccount({ userId: user.id, type: "oauth", provider: "google", providerAccountId: "google-sub" });
    assert.equal((await adapter.getUserByAccount({ provider: "google", providerAccountId: "google-sub" })).id, user.id);
    await adapter.createSession({ userId: user.id, sessionToken: "test-session", expires: new Date(Date.now() + 60_000) });
    await db.user.update({ where: { id: user.id }, data: { role: "CAPTAIN" } });
    assert.equal((await adapter.getSessionAndUser("test-session")).user.role, "CAPTAIN");
    await adapter.deleteSession("test-session");
    assert.equal(await adapter.getSessionAndUser("test-session"), null);
    await assert.rejects(db.playerProfile.create({ data: { userId: user.id } }), { code: "P2002" });
    await assert.rejects(db.playerProfile.update({ where: { id: profile.id }, data: { goals: -1 } }));

    const match = await db.match.create({ data: { date: new Date(), createdById: user.id, status: "DRAFT" } });
    const appearance = { matchId: match.id, playerProfileId: profile.id, team: "A", position: "MID", ovrAtMatch: 70, isMotm: true };
    await db.matchPlayer.create({ data: appearance });
    await assert.rejects(db.matchPlayer.create({ data: appearance }), { code: "P2002" });
    await assert.rejects(db.matchPlayer.create({ data: { ...appearance, playerProfileId: legacy.playerProfile.id, team: "B" } }), { code: "P2002" });
    await assert.rejects(db.matchPlayer.create({ data: { ...appearance, playerProfileId: "missing", isMotm: false } }), { code: "P2003" });

    const extras = await Promise.all([1, 2].map(i => adapter.createUser({ email: `extra${i}@example.com`, emailVerified: null, name: `Extra ${i}`, image: null })));
    const extraProfiles = await db.playerProfile.findMany({ where: { userId: { in: extras.map(u => u.id) } }, orderBy: { id: "asc" } });
    // Profiles are resolved by userId: cuid ordering does not follow creation order.
    const profileOf = async (uid) => db.playerProfile.findUniqueOrThrow({ where: { userId: uid } });
    const votedProfile = await profileOf(extras[0].id);
    const secondProfile = await profileOf(extras[1].id);
    const ids = [profile.id, legacy.playerProfile.id, ...extraProfiles.map(p => p.id)];
    const input = { requestId: randomUUID(), date: new Date().toISOString(), lineup: ids.map((id, i) => ({ id, team: i < 2 ? "A" : "B", position: "MID", ovrRating: 99 })) };
    await assert.rejects(createGlobalMatch(db, extras[0].id, input), /kaptan/);
    const globalId = await createGlobalMatch(db, user.id, input);
    assert.equal(await createGlobalMatch(db, user.id, input), globalId);
    const stored = await db.match.findUniqueOrThrow({ where: { id: globalId }, include: { players: true } });
    assert.equal(stored.players.find(p => p.playerProfileId === profile.id).ovrAtMatch, 0);
    const report = { scoreA: 1, scoreB: 0, motmId: profile.id, players: ids.map((id, i) => ({ id, goals: i === 0 ? 1 : 0, assists: i === 1 ? 1 : 0 })) };
    await assert.rejects(reportGlobalMatch(db, legacy.id, globalId, report), /yetkin/);
    await assert.rejects(reportGlobalMatch(db, user.id, globalId, { ...report, scoreA: 2 }), /eşleşmelidir/);
    const outsider = structuredClone(report); outsider.players[3].id = "someone-else";
    await assert.rejects(reportGlobalMatch(db, user.id, globalId, outsider), /kadro/);
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).matchesPlayed, 0);
    const concurrent = await Promise.allSettled([reportGlobalMatch(db, user.id, globalId, report), reportGlobalMatch(db, user.id, globalId, report)]);
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
    const after = await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    assert.equal(after.goals, 1); assert.equal(after.matchesPlayed, 1); assert.equal(after.motmCount, 1);
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: legacy.playerProfile.id } })).assists, 1);
    await assert.rejects(reportGlobalMatch(db, user.id, globalId, report), /zaten/);
    assert.equal((await db.match.findUniqueOrThrow({ where: { id: globalId } })).status, "COMPLETED");

    // --- custom team names --------------------------------------------------
    const named = await createGlobalMatch(db, user.id, { ...input, requestId: randomUUID(), teamAName: "  Gece  Yıldızları ", teamBName: "<b>Sahil</b>" });
    const namedRow = await db.match.findUniqueOrThrow({ where: { id: named } });
    assert.equal(namedRow.teamAName, "Gece Yıldızları");
    assert.equal(namedRow.teamBName, "bSahil/b");
    // Omitting them keeps the platform defaults.
    const defaultNamed = await createGlobalMatch(db, user.id, { ...input, requestId: randomUUID() });
    const defaultRow = await db.match.findUniqueOrThrow({ where: { id: defaultNamed } });
    assert.equal(defaultRow.teamAName, "A Takımı");
    assert.equal(defaultRow.teamBName, "B Takımı");
    // Identical names would make the scoreline meaningless.
    await assert.rejects(createGlobalMatch(db, user.id, { ...input, requestId: randomUUID(), teamAName: "Krampon", teamBName: "Krampon" }), /farklı/);
    await assert.rejects(createGlobalMatch(db, user.id, { ...input, requestId: randomUUID(), teamAName: "x".repeat(31) }));


    // All six-attribute votes are crew-scoped. A separate Bridge crew below
    // verifies that a second crew's verdict never changes this one's average.
    const crew = await db.crew.create({ data: { name: "Voters", ownerId: user.id, inviteCode: generateInviteCode() } });
    await db.crewMember.create({ data: { crewId: crew.id, userId: user.id, role: "OWNER" } });
    await db.crewMember.create({ data: { crewId: crew.id, userId: extras[0].id, role: "MEMBER" } });
    await db.crewMember.create({ data: { crewId: crew.id, userId: extras[1].id, role: "MEMBER" } });
    // legacy and `user` overlap in a second, tiny crew so legacy's own rating of
    // the target below is legal without opening the Voters crew to them.
    const bridgeCrew = await db.crew.create({ data: { name: "Bridge", ownerId: legacy.id, inviteCode: generateInviteCode() } });
    await db.crewMember.create({ data: { crewId: bridgeCrew.id, userId: legacy.id, role: "OWNER" } });
    await db.crewMember.create({ data: { crewId: bridgeCrew.id, userId: user.id, role: "MEMBER" } });

    const scores = n => ({ pace: n, shooting: n, passing: n, dribbling: n, defending: n, physical: n });
    const verdict = async (crewId, targetId) => (await getCrewOvr(db, crewId, [targetId])).get(targetId);
    const seedOvr = (await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).ovrRating;
    await assert.rejects(castPeerVote(db, user.id, crew.id, user.id, scores(90)), /Kendine/);
    await assert.rejects(castPeerVote(db, "missing-user", crew.id, user.id, scores(90)), /oturumu/);
    await assert.rejects(castPeerVote(db, extras[0].id, crew.id, "missing-user", scores(90)), /ekibin/);
    for (const value of [-1, 100, 3.5, null, "", NaN]) await assert.rejects(castPeerVote(db, extras[0].id, crew.id, user.id, { ...scores(60), pace: value }));
    // Ordinary players vote; submitted identity/OVR fields do not control the result.
    await castPeerVote(db, extras[0].id, crew.id, user.id, { ...scores(0), ovrRating: 99, voterId: user.id });
    assert.equal((await verdict(crew.id, user.id)).ovrRating, 0);
    await castPeerVote(db, extras[1].id, crew.id, user.id, scores(99));
    assert.deepEqual((await verdict(crew.id, user.id)).scores, scores(49.5));
    assert.equal((await verdict(crew.id, user.id)).ovrRating, 50);
    await castPeerVote(db, extras[0].id, crew.id, user.id, scores(60));
    assert.equal(await db.playerRatingVote.count({ where: { crewId: crew.id, targetUserId: user.id } }), 2);
    assert.equal((await verdict(crew.id, user.id)).ovrRating, 80);
    await Promise.all([
      castPeerVote(db, extras[0].id, crew.id, user.id, scores(20)),
      castPeerVote(db, extras[1].id, crew.id, user.id, scores(80)),
      castPeerVote(db, legacy.id, bridgeCrew.id, user.id, scores(10)),
    ]);
    assert.equal((await verdict(crew.id, user.id)).ovrRating, 50);
    assert.equal((await verdict(bridgeCrew.id, user.id)).ovrRating, 10);
    await Promise.all([castPeerVote(db, extras[0].id, crew.id, user.id, scores(30)), castPeerVote(db, extras[0].id, crew.id, user.id, scores(90))]);
    const ratings = await db.playerRatingVote.findMany({ where: { crewId: crew.id, targetUserId: user.id } });
    assert.equal(ratings.length, 2);
    assert.equal((await verdict(crew.id, user.id)).ovrRating, Math.round(ratings.reduce((sum, row) => sum + row.pace, 0) / 2));
    const dualProfile = await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    assert.equal(dualProfile.ovrRating, seedOvr, "crew votes must not overwrite global OVR");
    assert.equal(dualProfile.goals, 1); assert.equal(dualProfile.matchesPlayed, 1);
    assert.equal((await db.matchPlayer.findUniqueOrThrow({ where: { matchId_playerProfileId: { matchId: globalId, playerProfileId: profile.id } } })).ovrAtMatch, 0);
    await assert.rejects(db.playerRatingVote.create({ data: { crewId: crew.id, voterId: extras[0].id, targetUserId: user.id, ...scores(50) } }), { code: "P2002" });
    for (const attr of Object.keys(scores(0))) {
      await assert.rejects(db.playerRatingVote.update({ where: { id: ratings[0].id }, data: { [attr]: 100 } }));
      await assert.rejects(db.playerRatingVote.update({ where: { id: ratings[0].id }, data: { [attr]: -1 } }));
    }
    const noProfile = await db.user.create({ data: { email: `no-profile-${randomUUID()}@test.dev` } });
    await db.crewMember.create({ data: { crewId: crew.id, userId: noProfile.id } });
    await assert.rejects(castPeerVote(db, user.id, crew.id, noProfile.id, scores(50)), /profili bulunamadı/);
    // --- safe deletion ------------------------------------------------------
    // Only the creating captain may delete, and a plain PLAYER never may.
    await assert.rejects(deleteGlobalMatch(db, extras[0].id, globalId), /kaptan/);
    await assert.rejects(deleteGlobalMatch(db, extras[1].id, globalId), /kaptan/);
    // An existing captain who did not create the match is rejected too.
    const otherCaptain = await db.user.create({ data: { name: "Other Captain", email: `cap2-${randomUUID()}@example.test`, role: "CAPTAIN", playerProfile: { create: { position: "MID", ovrRating: 70 } } } });
    await assert.rejects(deleteGlobalMatch(db, otherCaptain.id, globalId), /kuran kaptan/);

    // Deleting a reported match rewinds exactly the statistics it produced.
    const beforeDelete = await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const deleteSeason = await db.season.findFirst({ where: { isActive: true }, select: { id: true } });
    const beforeSeason = deleteSeason ? await db.playerSeasonStat.findUniqueOrThrow({ where: { seasonId_playerProfileId: { seasonId: deleteSeason.id, playerProfileId: profile.id } } }) : null;
    // This match awarded 1 goal + 1 MOTM, so the totals must drop by exactly that.
    assert.ok(beforeDelete.goals >= 1 && beforeDelete.matchesPlayed >= 1 && beforeDelete.motmCount >= 1);
    await deleteGlobalMatch(db, user.id, globalId);
    assert.equal(await db.match.findUnique({ where: { id: globalId } }), null);
    // Roster rows cascaded with the match.
    assert.equal(await db.matchPlayer.count({ where: { matchId: globalId } }), 0);
    const afterDelete = await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    assert.equal(afterDelete.goals, beforeDelete.goals - 1);
    assert.equal(afterDelete.matchesPlayed, beforeDelete.matchesPlayed - 1);
    assert.equal(afterDelete.motmCount, beforeDelete.motmCount - 1);
    // A rewind must never drive a counter below zero.
    assert.ok(afterDelete.goals >= 0 && afterDelete.matchesPlayed >= 0 && afterDelete.motmCount >= 0);
    // The season line moves in lockstep with the career line.
    if (beforeSeason) {
      const afterSeason = await db.playerSeasonStat.findUniqueOrThrow({ where: { seasonId_playerProfileId: { seasonId: deleteSeason.id, playerProfileId: profile.id } } });
      assert.equal(afterSeason.goals, beforeSeason.goals - 1);
      assert.equal(afterSeason.matchesPlayed, beforeSeason.matchesPlayed - 1);
      assert.equal(afterSeason.motmCount, beforeSeason.motmCount - 1);
    }
    // The assisting player of the same match is rewound too.
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: legacy.playerProfile.id } })).assists, 0);
    // Other matches in the archive are unaffected.
    assert.notEqual(await db.match.findUnique({ where: { id: named } }), null);
    // An unreported match never wrote any counter, so it must not rewind anything.
    const pendingMatch = await createGlobalMatch(db, user.id, { requestId: randomUUID(), date: new Date().toISOString(), lineup: ids.map((id, i) => ({ id, team: i < 2 ? "A" : "B", position: "MID" })) });
    const beforePending = await db.playerProfile.findUniqueOrThrow({ where: { id: votedProfile.id } });
    await deleteGlobalMatch(db, user.id, pendingMatch);
    const afterPending = await db.playerProfile.findUniqueOrThrow({ where: { id: votedProfile.id } });
    assert.equal(afterPending.goals, beforePending.goals);
    assert.equal(afterPending.assists, beforePending.assists);
    assert.equal(afterPending.matchesPlayed, beforePending.matchesPlayed);
    assert.equal(afterPending.motmCount, beforePending.motmCount);
    // Deleting twice is a clean, explicit error rather than a crash.
    await assert.rejects(deleteGlobalMatch(db, user.id, globalId), /zaten silinmiş/);

    // --- crew peer voting ---------------------------------------------------
    // The Voters crew and its members already exist (created before the rating
    // section above, because attribute ratings also require a shared crew).
    const otherCrew = await db.crew.create({ data: { name: "Outsiders", ownerId: legacy.id, inviteCode: generateInviteCode() } });
    await db.crewMember.create({ data: { crewId: otherCrew.id, userId: legacy.id, role: "OWNER" } });
    await db.crewMember.create({ data: { crewId: otherCrew.id, userId: otherCaptain.id, role: "MEMBER" } });

    await db.playerProfile.update({ where: { id: votedProfile.id }, data: { ovrRating: 10 } });
    // Nobody may vote for themselves or across crew boundaries.
    await assert.rejects(castPeerVote(db, user.id, crew.id, user.id, scores(99)), /Kendine/);
    await assert.rejects(castPeerVote(db, legacy.id, crew.id, extras[0].id, scores(90)), /ekibin/);
    await assert.rejects(castPeerVote(db, user.id, crew.id, legacy.id, scores(90)), /ekibin/);
    await assert.rejects(castPeerVote(db, otherCaptain.id, crew.id, extras[0].id, scores(70)), /aynı ekibin üyeleri/);
    await assert.rejects(castPeerVote(db, "ghost-user", crew.id, extras[0].id, scores(90)), /oturumu/);
    for (const bad of [-1, 100, 3.5, "", null, NaN, "abc"]) {
      await assert.rejects(castPeerVote(db, user.id, crew.id, extras[0].id, { ...scores(50), physical: bad }));
    }
    assert.equal(await db.playerRatingVote.count({ where: { crewId: crew.id, targetUserId: extras[0].id } }), 0);

    await castPeerVote(db, user.id, crew.id, extras[0].id, scores(80));
    assert.equal((await verdict(crew.id, extras[0].id)).ovrRating, 80);
    await castPeerVote(db, extras[1].id, crew.id, extras[0].id, scores(60));
    assert.equal((await verdict(crew.id, extras[0].id)).ovrRating, 70);
    await castPeerVote(db, user.id, crew.id, extras[0].id, scores(90));
    assert.equal(await db.playerRatingVote.count({ where: { crewId: crew.id, targetUserId: extras[0].id } }), 2);
    assert.equal((await verdict(crew.id, extras[0].id)).ovrRating, 75);
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: votedProfile.id } })).ovrRating, 10);
    await assert.rejects(db.playerRatingVote.create({ data: { crewId: crew.id, voterId: user.id, targetUserId: extras[0].id, ...scores(50) } }), { code: "P2002" });

    // Leaving the crew revokes the ability to vote.
    await db.crewMember.delete({ where: { crewId_userId: { crewId: crew.id, userId: extras[1].id } } });
    await assert.rejects(castPeerVote(db, extras[1].id, crew.id, extras[0].id, scores(10)), /ekibin/);

    // --- crew data isolation ------------------------------------------------
    const inCrewProfile = votedProfile;
    const outsiderProfile = secondProfile;
    const season = await db.season.findFirst({ where: { isActive: true }, select: { id: true } });
    assert.notEqual(season, null, 'an active season is required for the isolation checks');
    const seasonId = season.id;
    const scopedMatch = await db.match.create({ data: { date: new Date(), createdById: user.id, status: "COMPLETED", isCompleted: true, crewId: crew.id, seasonId, teamAScore: 3, teamBScore: 0, reportedAt: new Date() } });
    const globalMatch = await db.match.create({ data: { date: new Date(), createdById: user.id, status: "COMPLETED", isCompleted: true, crewId: null, seasonId, teamAScore: 5, teamBScore: 0, reportedAt: new Date() } });
    await db.matchPlayer.create({ data: { matchId: scopedMatch.id, playerProfileId: inCrewProfile.id, team: "A", position: "MID", ovrAtMatch: 70, goals: 3 } });
    await db.matchPlayer.create({ data: { matchId: globalMatch.id, playerProfileId: inCrewProfile.id, team: "A", position: "MID", ovrAtMatch: 70, goals: 5 } });
    // The season line deliberately mixes both scopes; the crew view must not.
    // The platform-wide line deliberately mixes both scopes; upsert since a
    // reported match may already have written one for this player.
    await db.playerSeasonStat.upsert({
      where: { seasonId_playerProfileId: { seasonId, playerProfileId: inCrewProfile.id } },
      create: { seasonId, playerProfileId: inCrewProfile.id, goals: 8, assists: 0, matchesPlayed: 2, motmCount: 0 },
      update: { goals: 8, assists: 0, matchesPlayed: 2, motmCount: 0 },
    });

    const scopedTotals = await aggregateCrewStandings(db, crew.id, seasonId, [inCrewProfile.id, outsiderProfile.id, legacy.playerProfile.id]);
    const leaderRow = scopedTotals.get(inCrewProfile.id);
    assert.notEqual(leaderRow, undefined);
    // Only the crew-scoped match counts: 3 goals, not the 8 on the season line.
    assert.equal(leaderRow.goals, 3);
    assert.equal(leaderRow.matchesPlayed, 1);
    // A player who never played for this crew has no row, so the UI shows zero.
    assert.equal(scopedTotals.has(legacy.playerProfile.id), false);
    // The other crew cannot see this crew match either.
    const otherTotals = await aggregateCrewStandings(db, otherCrew.id, seasonId, [inCrewProfile.id, legacy.playerProfile.id]);
    assert.equal(otherTotals.has(inCrewProfile.id), false);
    // A crew match's goals never bleed into a global-scope read.
    const globalTotals = await aggregateCrewStandings(db, crew.id, seasonId, [inCrewProfile.id]);
    assert.equal(globalTotals.get(inCrewProfile.id).goals, 3);

    // A crew match may only field that crew's members. `legacy` joins so a full
    // four-player squad can be formed; `extras[1]` was removed earlier to prove
    // that leaving revokes voting, so it is restored first.
    await db.crewMember.create({ data: { crewId: crew.id, userId: legacy.id, role: "MEMBER" } });
    await db.crewMember.create({ data: { crewId: crew.id, userId: extras[1].id, role: "MEMBER" } });
    const crewLineup = [votedProfile.id, secondProfile.id, legacy.playerProfile.id, profile.id].map((id, i) => ({ id, team: i < 2 ? "A" : "B", position: "MID" }));
    const crewMatchId = await createGlobalMatch(db, user.id, { requestId: randomUUID(), date: new Date().toISOString(), crewId: crew.id, lineup: crewLineup });
    assert.equal((await db.match.findUniqueOrThrow({ where: { id: crewMatchId } })).crewId, crew.id);
    // Posting to a crew the captain does not belong to is refused outright.
    await assert.rejects(createGlobalMatch(db, user.id, { requestId: randomUUID(), date: new Date().toISOString(), crewId: otherCrew.id, lineup: crewLineup }), /oldu.*n ekip/);
    // A captain cannot roster anyone outside the crew they are posting to.
    // `otherCaptain` never joined this crew, so any lineup including it is invalid.
    const outsiderProfileRow = await profileOf(otherCaptain.id);
    const foreignLineup = [votedProfile.id, secondProfile.id, legacy.playerProfile.id, outsiderProfileRow.id].map((id, i) => ({ id, team: i < 2 ? "A" : "B", position: "MID" }));
    await assert.rejects(createGlobalMatch(db, user.id, { requestId: randomUUID(), date: new Date().toISOString(), crewId: crew.id, lineup: foreignLineup }), /ekibin/);
    // ---- Invitations and invite links -------------------------------------
    // A crew always carries a shareable code, and the unique index rejects a copy.
    const freshCrew = await db.crew.create({ data: { name: "Link Crew", ownerId: user.id, inviteCode: generateInviteCode() } });
    assert.match(freshCrew.inviteCode, /^[34679ACDEFGHJKMNPQRTUVWXY]{8}$/);
    // `user` owns the crew, so it must also be a managing member: this is the
    // state createCrew() establishes and the state assertManager() relies on.
    await db.crewMember.create({ data: { crewId: freshCrew.id, userId: user.id, role: "OWNER" } });
    // A duplicate code is refused by the unique index rather than by app code.
    await assert.rejects(
      db.crew.create({ data: { name: "Copycat", ownerId: user.id, inviteCode: freshCrew.inviteCode } }),
      error => error.code === "P2002",
      "a duplicate invite code must be rejected by the unique index",
    );

    // A plain member cannot invite even when the service is called directly.
    const plainMember = await db.user.create({ data: { email: `member-${randomUUID()}@test.dev` } });
    await db.crewMember.create({ data: { crewId: freshCrew.id, userId: plainMember.id, role: "MEMBER" } });
    await assert.rejects(inviteUserToCrew(db, plainMember.id, freshCrew.id, legacy.id), /kaptan/);
    const inviteTarget = await db.user.create({ data: { email: `target-${randomUUID()}@test.dev`, name: "Hedef Oyuncu" } });
    await inviteUserToCrew(db, user.id, freshCrew.id, inviteTarget.id);
    // Self-invite, existing member and unknown user are all refused.
    await assert.rejects(inviteUserToCrew(db, user.id, freshCrew.id, user.id), /Kendini/);
    await assert.rejects(inviteUserToCrew(db, user.id, freshCrew.id, plainMember.id), /üyesi/);
    await assert.rejects(inviteUserToCrew(db, user.id, freshCrew.id, "yok-boyle-bir-kullanici"), /bulunamadı/);
    // Re-inviting refreshes the single row instead of stacking duplicates.
    await inviteUserToCrew(db, user.id, freshCrew.id, inviteTarget.id);
    assert.equal(await db.crewInvitation.count({ where: { crewId: freshCrew.id, receiverId: inviteTarget.id } }), 1);

    // Only the invited user may accept; another signed-in user is refused.
    const invitation = await db.crewInvitation.findUniqueOrThrow({ where: { crewId_receiverId: { crewId: freshCrew.id, receiverId: inviteTarget.id } } });
    await assert.rejects(acceptInvitation(db, legacy.id, invitation.id), /ait değil/);
    assert.equal((await acceptInvitation(db, inviteTarget.id, invitation.id)).crewId, freshCrew.id);
    assert.equal((await db.crewInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status, "ACCEPTED");
    // A settled invitation cannot be accepted twice.
    await assert.rejects(acceptInvitation(db, inviteTarget.id, invitation.id), /sonuçlanmış/);
    assert.equal(await db.crewMember.count({ where: { crewId: freshCrew.id } }), 3);

    // A rejected invitation never grants membership.
    const rejectTarget = await db.user.create({ data: { email: `reject-${randomUUID()}@test.dev` } });
    await inviteUserToCrew(db, user.id, freshCrew.id, rejectTarget.id);
    const toReject = await db.crewInvitation.findUniqueOrThrow({ where: { crewId_receiverId: { crewId: freshCrew.id, receiverId: rejectTarget.id } } });
    await rejectInvitation(db, rejectTarget.id, toReject.id);
    // Join through a shareable link, then reopen the same link.
    const linkJoiner = await db.user.create({ data: { email: `link-${randomUUID()}@test.dev` } });
    const firstJoin = await joinCrewByInviteCode(db, linkJoiner.id, freshCrew.inviteCode.toLowerCase());
    assert.equal(firstJoin.outcome, "joined", "the code is matched case-insensitively");
    assert.equal(firstJoin.crewId, freshCrew.id);
    const secondJoin = await joinCrewByInviteCode(db, linkJoiner.id, freshCrew.inviteCode);
    assert.equal(secondJoin.outcome, "already", "re-opening the link must not duplicate the membership");
    assert.equal(await db.crewMember.count({ where: { crewId: freshCrew.id, userId: linkJoiner.id } }), 1);
    // A well-formed but unregistered code resolves to `invalid`; a code outside the
    // alphabet (or the wrong length) is rejected before any query runs. `Z` and `B`
    // are deliberately outside the alphabet, so "ZZZZZZZZ" would be a format error.
    assert.deepEqual(await joinCrewByInviteCode(db, linkJoiner.id, "AAAAAAAA"), { outcome: "invalid" });
    await assert.rejects(joinCrewByInviteCode(db, linkJoiner.id, "kisa"), /geçersiz|8 karakter/);
    await assert.rejects(joinCrewByInviteCode(db, linkJoiner.id, "../../etc/passwd"), /geçersiz|8 karakter/);
    await assert.rejects(joinCrewByInviteCode(db, linkJoiner.id, "ZZZZZZZZ"), /geçersiz|8 karakter/);
    // Joining by link settles a pending invitation for the same crew.
    const linkTarget = await db.user.create({ data: { email: `linktarget-${randomUUID()}@test.dev` } });
    await inviteUserToCrew(db, user.id, freshCrew.id, linkTarget.id);
    await joinCrewByInviteCode(db, linkTarget.id, freshCrew.inviteCode);
    assert.equal((await db.crewInvitation.findUniqueOrThrow({ where: { crewId_receiverId: { crewId: freshCrew.id, receiverId: linkTarget.id } } })).status, "ACCEPTED");

    // The invite search never exposes the requester or current members.
    const searchable = await searchInvitableUsers(db, freshCrew.id, user.id, "Hedef");
    assert.equal(searchable.some(entry => entry.id === user.id), false);
    assert.equal(searchable.some(entry => entry.id === plainMember.id), false);
    assert.equal(searchable.some(entry => entry.id === inviteTarget.id), false, "an existing member must not be offered again");
    assert.equal(searchable.some(entry => entry.id === linkJoiner.id), false);
    // A one-character query returns nothing rather than the whole user table.
    assert.deepEqual(await searchInvitableUsers(db, freshCrew.id, user.id, "H"), []);

    // A full crew refuses further joins through the link.
    for (let i = 0; i < CREW_MEMBER_LIMIT; i++) {
      const filler = await db.user.create({ data: { email: `filler-${i}-${randomUUID()}@test.dev` } });
      await db.crewMember.create({ data: { crewId: freshCrew.id, userId: filler.id, role: "MEMBER" } });
    }
    const latecomer = await db.user.create({ data: { email: `late-${randomUUID()}@test.dev` } });
    assert.equal((await joinCrewByInviteCode(db, latecomer.id, freshCrew.inviteCode)).outcome, "full");
    assert.equal(await db.crewMember.count({ where: { crewId: freshCrew.id, userId: latecomer.id } }), 0);


    assert.equal((await db.crewInvitation.findUniqueOrThrow({ where: { id: toReject.id } })).status, "REJECTED");
    assert.equal(await db.crewMember.count({ where: { crewId: freshCrew.id, userId: rejectTarget.id } }), 0);
    await assert.rejects(rejectInvitation(db, legacy.id, toReject.id), /ait değil/);

    // ---- GÖREV 1: kicking a member ---------------------------------------
    const kickCrew = await db.crew.create({ data: { name: "Kick Crew", ownerId: user.id, inviteCode: generateInviteCode() } });
    const kickOwner = user;
    const kickCaptain = await db.user.create({ data: { email: `kc-${randomUUID()}@test.dev`, name: "Kaptan" } });
    const kickMate = await db.user.create({ data: { email: `km-${randomUUID()}@test.dev`, name: "Ekip Arkadasi" } });
    const kickTarget = await db.user.create({ data: { email: `kt-${randomUUID()}@test.dev`, name: "Cikarilacak" } });
    const statsTarget = await db.playerProfile.create({ data: { userId: kickTarget.id, position: "MID", ovrRating: 80, goals: 12, assists: 4, matchesPlayed: 9, motmCount: 2 } });
    await db.playerSeasonStat.create({ data: { seasonId: (await db.season.findFirstOrThrow()).id, playerProfileId: statsTarget.id, goals: 12, assists: 4, matchesPlayed: 9, motmCount: 2, ovrRating: 80 } });
    for (const [uid, role] of [[kickOwner.id, "OWNER"], [kickCaptain.id, "CAPTAIN"], [kickMate.id, "MEMBER"], [kickTarget.id, "MEMBER"]]) {
      await db.crewMember.create({ data: { crewId: kickCrew.id, userId: uid, role } });
    }

    // A plain member cannot kick anybody.
    await assert.rejects(kickCrewMember(db, kickMate.id, kickCrew.id, kickTarget.id), /kaptan/);
    // Nobody may kick themselves, and the OWNER can never be removed.
    await assert.rejects(kickCrewMember(db, kickOwner.id, kickCrew.id, kickOwner.id), /Kendini/);
    await assert.rejects(kickCrewMember(db, kickCaptain.id, kickCrew.id, kickOwner.id), /sahibi/);
    // A captain may not remove a fellow captain; the owner may. A second captain
    // is needed so the actor and the target are genuinely different people.
    const rivalCaptain = await db.user.create({ data: { email: `rc-${randomUUID()}@test.dev`, name: "Diger Kaptan" } });
    await db.crewMember.create({ data: { crewId: kickCrew.id, userId: rivalCaptain.id, role: "CAPTAIN" } });
    await assert.rejects(kickCrewMember(db, kickCaptain.id, kickCrew.id, rivalCaptain.id), /kurucu/);
    // The owner, however, may remove a captain.
    await kickCrewMember(db, kickOwner.id, kickCrew.id, rivalCaptain.id);
    assert.equal(await db.crewMember.count({ where: { crewId: kickCrew.id, userId: rivalCaptain.id } }), 0);

    // GÖREV 4: CO_CAPTAIN is an officer for kicks too — a captain cannot remove
    // one, only the owner can, and writing the value proves the migration landed.
    const coCaptain = await db.user.create({ data: { email: `co-${randomUUID()}@test.dev`, name: "Kaptan Yardimcisi" } });
    await db.crewMember.create({ data: { crewId: kickCrew.id, userId: coCaptain.id, role: "CO_CAPTAIN" } });
    await assert.rejects(kickCrewMember(db, kickCaptain.id, kickCrew.id, coCaptain.id), /kurucu/);
    await kickCrewMember(db, kickOwner.id, kickCrew.id, coCaptain.id);
    assert.equal(await db.crewMember.count({ where: { crewId: kickCrew.id, userId: coCaptain.id } }), 0);

    // The captain kicks an ordinary member: membership goes, history stays.
    await kickCrewMember(db, kickCaptain.id, kickCrew.id, kickTarget.id);
    assert.equal(await db.crewMember.count({ where: { crewId: kickCrew.id, userId: kickTarget.id } }), 0);
    assert.notEqual(await db.user.findUnique({ where: { id: kickTarget.id } }), null, "the account must survive a kick");
    const profileAfter = await db.playerProfile.findUniqueOrThrow({ where: { id: statsTarget.id } });
    assert.equal(profileAfter.goals, 12, "career goals must not be rolled back by a kick");
    assert.equal(profileAfter.matchesPlayed, 9);
    assert.equal(profileAfter.motmCount, 2);
    const seasonRow = await db.playerSeasonStat.findFirstOrThrow({ where: { playerProfileId: statsTarget.id } });
    assert.equal(seasonRow.goals, 12, "season stats must not be rolled back by a kick");
    // Kicking someone who already left is a clean error, not a crash.
    await assert.rejects(kickCrewMember(db, kickCaptain.id, kickCrew.id, kickTarget.id), /üyesi değil/);
    // And a kicked member can no longer be voted for in that crew.
    assert.equal(await db.crewMember.count({ where: { crewId: kickCrew.id } }), 3);
    // ---- GÖREV 3: contextual OVR and crew-scoped statistics ---------------
    // The same player in two crews must get a different rating in each, and one
    // crew's votes must never surface in the other.
    const dualCrew = await db.crew.create({ data: { name: "Crew A", ownerId: user.id, inviteCode: generateInviteCode() } });
    const secondCrew = await db.crew.create({ data: { name: "Crew B", ownerId: legacy.id, inviteCode: generateInviteCode() } });
    const rated = await db.user.create({ data: { email: `dual-${randomUUID()}@test.dev`, name: "Cift Ekipli" } });
    const ctxProfile = await db.playerProfile.create({ data: { userId: rated.id, position: "MID", ovrRating: 10 } });
    // Crew A: the owner and one extra voter, both rating `rated` at 90.
    const aVoter = await db.user.create({ data: { email: `av-${randomUUID()}@test.dev` } });
    const ctxAVoterProfile = await db.playerProfile.create({ data: { userId: aVoter.id, position: "DEF" } });
    for (const [uid, role] of [[user.id, "OWNER"], [aVoter.id, "MEMBER"], [rated.id, "MEMBER"]]) {
      await db.crewMember.create({ data: { crewId: dualCrew.id, userId: uid, role } });
    }
    // The two squad players appear in a crew A match, so they must be members.
    for (const p of extraProfiles) {
      await db.crewMember.create({ data: { crewId: dualCrew.id, userId: p.userId, role: "MEMBER" } });
    }
    // Crew B: the legacy captain rates the same player at 30.
    const bVoter = await db.user.create({ data: { email: `bv-${randomUUID()}@test.dev` } });
    const ctxBVoterProfile = await db.playerProfile.create({ data: { userId: bVoter.id, position: "DEF" } });
    for (const [uid, role] of [[legacy.id, "OWNER"], [bVoter.id, "MEMBER"], [rated.id, "MEMBER"]]) {
      await db.crewMember.create({ data: { crewId: secondCrew.id, userId: uid, role } });
    }
    // extraProfiles[1] plays in the crew B match.
    await db.crewMember.create({ data: { crewId: secondCrew.id, userId: extraProfiles[1].userId, role: "MEMBER" } });
    await castPeerVote(db, user.id, dualCrew.id, rated.id, scores(90));
    await castPeerVote(db, aVoter.id, dualCrew.id, rated.id, scores(90));
    await castPeerVote(db, legacy.id, secondCrew.id, rated.id, scores(30));

    const aView = await getCrewOvr(db, dualCrew.id, [rated.id]);
    const bView = await getCrewOvr(db, secondCrew.id, [rated.id]);
    assert.equal(aView.get(rated.id).ovrRating, 90, "crew A must see its own 90 average");
    assert.equal(aView.get(rated.id).voteCount, 2);
    assert.equal(aView.get(rated.id).isUnrated, false);
    assert.equal(bView.get(rated.id).ovrRating, 30, "crew B must see its own 30 average, not crew A's 90");
    assert.equal(bView.get(rated.id).voteCount, 1);
    // A player nobody has rated is reported as unrated rather than as a 0.
    const neverRated = await db.user.create({ data: { email: `nr-${randomUUID()}@test.dev` } });
    await db.crewMember.create({ data: { crewId: dualCrew.id, userId: neverRated.id, role: "MEMBER" } });
    const unratedView = await getCrewOvr(db, dualCrew.id, [neverRated.id]);
    assert.equal(unratedView.get(neverRated.id).ovrRating, null, "an unrated player has no crew OVR");
    assert.equal(unratedView.get(neverRated.id).isUnrated, true);
    assert.equal((await getCrewOvr(db, secondCrew.id, [neverRated.id])).get(neverRated.id).ovrRating, null);
    // The profile-space view resolves the same per-crew values.
    const byProfileA = await getCrewOvrByProfile(db, dualCrew.id, [ctxProfile.id]);
    const byProfileB = await getCrewOvrByProfile(db, secondCrew.id, [ctxProfile.id]);
    assert.equal(byProfileA.get(ctxProfile.id).ovrRating, 90);
    assert.equal(byProfileB.get(ctxProfile.id).ovrRating, 30);

    // A crew match snapshots the rating THIS crew gives its players, so the
    // archive never carries another crew's opinion.
    const ctxMatchA = randomUUID();
    await createGlobalMatch(db, user.id, { requestId: ctxMatchA, date: new Date().toISOString(), crewId: dualCrew.id, lineup: [
      { id: profile.id, team: "A", position: "MID" }, { id: ctxProfile.id, team: "A", position: "MID" },
      { id: ctxAVoterProfile.id, team: "B", position: "DEF" }, { id: extraProfiles[0].id, team: "B", position: "DEF" },
    ] });
    const recordedOvr = await db.matchPlayer.findUniqueOrThrow({ where: { matchId_playerProfileId: { matchId: ctxMatchA, playerProfileId: ctxProfile.id } } });
    assert.equal(recordedOvr.ovrAtMatch, 90, "a crew match must snapshot the crew's OVR");

    // Leaderboards only count their own crew's matches. `rated` scores in crew B
    // while playing for crew B, so crew A must show none of it.
    const ctxSeason = await db.season.findFirstOrThrow();
    const ctxMatchB = randomUUID();
    const ctxLineupB = [
      { id: legacy.playerProfile.id, team: "A", position: "MID" }, { id: ctxProfile.id, team: "A", position: "MID" },
      { id: ctxBVoterProfile.id, team: "B", position: "DEF" }, { id: extraProfiles[1].id, team: "B", position: "DEF" },
    ];
    await createGlobalMatch(db, legacy.id, { requestId: ctxMatchB, date: new Date().toISOString(), crewId: secondCrew.id, lineup: ctxLineupB });
    await reportGlobalMatch(db, legacy.id, ctxMatchB, {
      scoreA: 3, scoreB: 0, motmId: ctxProfile.id,
      players: ctxLineupB.map((p, i) => ({ id: p.id, goals: i === 1 ? 3 : 0, assists: i === 1 ? 1 : 0 })),
    });
    const aRow = (await getCrewSeasonLeaders(db, dualCrew.id, ctxSeason.id)).rows.find(r => r.userId === rated.id);
    assert.equal(aRow.goals, 0, "crew A must not show goals scored in crew B");
    assert.equal(aRow.assists, 0);
    assert.equal(aRow.motmCount, 0, "crew A must not show an MOTM earned in crew B");
    assert.equal(aRow.ovrRating, 90, "the crew A leaderboard shows the crew A rating");
    const bLeaders = await getCrewSeasonLeaders(db, secondCrew.id, ctxSeason.id);
    const bRow = bLeaders.rows.find(r => r.userId === rated.id);
    assert.equal(bRow.goals, 3, "crew B must show its own goal");
    assert.equal(bRow.motmCount, 1);
    assert.equal(bRow.ovrRating, 30, "the crew B leaderboard shows the crew B rating");
    // A player who never played for a crew is absent from its table entirely.
    assert.equal(bLeaders.rows.find(r => r.userId === user.id), undefined, "a non-member must not appear in a crew leaderboard");

    // GÖREV 2: a crew match may only field that crew's members. `user` is in crew
    // A, so putting them in a crew B lineup must be refused.
    await assert.rejects(createGlobalMatch(db, legacy.id, { requestId: randomUUID(), date: new Date().toISOString(), crewId: secondCrew.id, lineup: [
      { id: profile.id, team: "A", position: "MID" }, { id: ctxProfile.id, team: "A", position: "MID" },
      { id: ctxBVoterProfile.id, team: "B", position: "DEF" }, { id: extraProfiles[1].id, team: "B", position: "DEF" },
    ] }), /üyelerinden/);

    // ---- Renaming and deleting a crew (OWNER only) ------------------------
    const makePlayer = (label) => db.user.create({ data: { email: `${label}-${randomUUID()}@test.dev`, name: label, playerProfile: { create: { position: "MID", ovrRating: 60 } } }, include: { playerProfile: true } });
    const [delOwner, delCaptain, delMateA, delMateB, delBossB, delFillerB, delOutsider, delApplicant] = await Promise.all(["Kurucu", "Kaptan", "UyeA", "UyeB", "DigerKurucu", "DigerUye", "Disarida", "Basvuran"].map(makePlayer));
    const doomed = await db.crew.create({ data: { name: "Silinecek Ekip", ownerId: delOwner.id, inviteCode: generateInviteCode(), members: { create: [
      { userId: delOwner.id, role: "OWNER" }, { userId: delCaptain.id, role: "CAPTAIN" }, { userId: delMateA.id }, { userId: delMateB.id },
    ] } } });
    const survivor = await db.crew.create({ data: { name: "Kalacak Ekip", ownerId: delBossB.id, inviteCode: generateInviteCode(), members: { create: [
      { userId: delBossB.id, role: "OWNER" }, { userId: delMateA.id }, { userId: delMateB.id }, { userId: delFillerB.id },
    ] } } });
    const newMatch = (actor, crewId, rows) => createGlobalMatch(db, actor.id, { requestId: randomUUID(), date: new Date().toISOString(), crewId, lineup: rows.map(([p, team]) => ({ id: p.playerProfile.id, team, position: "MID" })) });
    const stat = (p, goals, assists) => ({ id: p.playerProfile.id, goals, assists });
    // The doomed crew: one REPORTED match (goals, an assist, a MOTM) and one still ONGOING.
    const doomedLineup = [[delOwner, "A"], [delCaptain, "A"], [delMateA, "B"], [delMateB, "B"]];
    const doomedReported = await newMatch(delOwner, doomed.id, doomedLineup);
    await reportGlobalMatch(db, delOwner.id, doomedReported, { scoreA: 2, scoreB: 1, motmId: delMateA.playerProfile.id, players: [stat(delOwner, 1, 1), stat(delCaptain, 1, 0), stat(delMateA, 1, 0), stat(delMateB, 0, 0)] });
    const doomedPending = await newMatch(delOwner, doomed.id, doomedLineup);
    // The survivor crew shares two players; what they earned there must stay.
    const survivorMatch = await newMatch(delBossB, survivor.id, [[delMateA, "A"], [delBossB, "A"], [delMateB, "B"], [delFillerB, "B"]]);
    await reportGlobalMatch(db, delBossB.id, survivorMatch, { scoreA: 2, scoreB: 0, motmId: delMateA.playerProfile.id, players: [stat(delMateA, 2, 0), stat(delBossB, 0, 0), stat(delMateB, 0, 0), stat(delFillerB, 0, 0)] });
    await castPeerVote(db, delMateA.id, doomed.id, delMateB.id, scores(80));
    await castPeerVote(db, delMateA.id, survivor.id, delMateB.id, scores(70));
    await db.crewInvitation.create({ data: { crewId: doomed.id, senderId: delOwner.id, receiverId: delOutsider.id } });
    await db.crewRequest.create({ data: { crewId: doomed.id, userId: delApplicant.id } });
    const counters = async (p) => { const row = await db.playerProfile.findUniqueOrThrow({ where: { id: p.playerProfile.id } }); return { goals: row.goals, assists: row.assists, played: row.matchesPlayed, motm: row.motmCount }; };
    const seasonLine = async (p) => { const row = await db.playerSeasonStat.findFirstOrThrow({ where: { playerProfileId: p.playerProfile.id } }); return { goals: row.goals, assists: row.assists, played: row.matchesPlayed, motm: row.motmCount }; };
    assert.deepEqual(await counters(delMateA), { goals: 3, assists: 0, played: 2, motm: 2 });
    assert.deepEqual(await seasonLine(delMateA), { goals: 3, assists: 0, played: 2, motm: 2 });


    // -- rename: only the OWNER, with the creation rules, unique ignoring case
    for (const actor of [delCaptain, delMateA, delOutsider, delBossB]) {
      await assert.rejects(renameCrewByOwner(db, actor.id, doomed.id, "Ele Gecirilen Ad"), /kurucusu/);
    }
    assert.equal((await db.crew.findUniqueOrThrow({ where: { id: doomed.id } })).name, "Silinecek Ekip");
    for (const bad of ["", "ab", "x".repeat(41), null, 7]) await assert.rejects(renameCrewByOwner(db, delOwner.id, doomed.id, bad), /karakter/);
    await assert.rejects(renameCrewByOwner(db, delOwner.id, doomed.id, "  kalacak   EKIP "), /zaten var/);
    await assert.rejects(renameCrewByOwner(db, delOwner.id, "no-such-crew", "Yeni Ad"), /bulunamadı/);
    assert.deepEqual(await renameCrewByOwner(db, delOwner.id, doomed.id, "  Yeni    Ad  "), { id: doomed.id, name: "Yeni Ad", changed: true });
    assert.equal((await db.crew.findUniqueOrThrow({ where: { id: doomed.id } })).name, "Yeni Ad");
    assert.equal((await renameCrewByOwner(db, delOwner.id, doomed.id, "Yeni Ad")).changed, false);
    // Changing only the capitalisation of the crew's own name is not a duplicate.
    assert.equal((await renameCrewByOwner(db, delOwner.id, doomed.id, "YENI AD")).changed, true);
    await renameCrewByOwner(db, delOwner.id, doomed.id, "Silinecek Ekip");
    // A rename touches the name only.
    assert.equal(await db.crewMember.count({ where: { crewId: doomed.id } }), 4);
    assert.equal(await db.match.count({ where: { crewId: doomed.id } }), 2);


    // -- delete: every refusal leaves everything exactly as it was
    const globalMatchesBefore = await db.match.count({ where: { crewId: null } });
    const snapshot = async () => ({
      crew: await db.crew.count({ where: { id: doomed.id } }),
      members: await db.crewMember.count({ where: { crewId: doomed.id } }),
      matches: await db.match.count({ where: { crewId: doomed.id } }),
      votes: await db.playerRatingVote.count({ where: { crewId: doomed.id } }),
      mateA: await counters(delMateA),
      mateASeason: await seasonLine(delMateA),
    });
    const intact = await snapshot();
    for (const [actor, confirm, expected] of [
      [delCaptain, "Silinecek Ekip", /kurucusu/], [delMateA, "Silinecek Ekip", /kurucusu/],
      [delOutsider, "Silinecek Ekip", /kurucusu/], [delBossB, "Silinecek Ekip", /kurucusu/],
      [delOwner, "Silinecek", /adını/], [delOwner, "silinecek ekip", /adını/], [delOwner, "", /adını/], [delOwner, null, /adını/], [delOwner, 42, /adını/],
    ]) {
      await assert.rejects(deleteCrewByOwner(db, actor.id, doomed.id, confirm), expected);
      assert.deepEqual(await snapshot(), intact, "a refused delete must change nothing");
    }
    await assert.rejects(deleteCrewByOwner(db, delOwner.id, "no-such-crew", "x"), /bulunamadı/);

    // -- a failure at the very last step rolls the whole rewind back
    const failing = new Proxy(db, { get(target, prop) {
      if (prop !== "$transaction") { const value = target[prop]; return typeof value === "function" ? value.bind(target) : value; }
      return (fn, options) => target.$transaction((tx) => fn(new Proxy(tx, { get(inner, key) {
        const value = inner[key];
        if (key === "crew") return new Proxy(value, { get(model, op) { if (op === "delete") return () => { throw new Error("simulated failure"); }; const method = model[op]; return typeof method === "function" ? method.bind(model) : method; } });
        return typeof value === "function" ? value.bind(inner) : value;
      } })), options);
    } });
    await assert.rejects(deleteCrewByOwner(failing, delOwner.id, doomed.id, "Silinecek Ekip"), /simulated failure/);
    assert.deepEqual(await snapshot(), intact, "an aborted delete must roll back the stat rewind and every row removal");

    // A damaged history must not break the delete: this counter is already below
    // what the match granted, so the rewind has to stop at zero.
    await db.playerProfile.update({ where: { id: delCaptain.playerProfile.id }, data: { goals: 0 } });


    // -- the real delete (typed name differs from the stored one only in spacing)
    const outcome = await deleteCrewByOwner(db, delOwner.id, doomed.id, "  Silinecek   Ekip ");
    assert.deepEqual(outcome, { id: doomed.id, name: "Silinecek Ekip", matchesDeleted: 2, membersRemoved: 4 });
    assert.equal(await db.crew.findUnique({ where: { id: doomed.id } }), null);
    for (const id of [doomedReported, doomedPending]) assert.equal(await db.match.findUnique({ where: { id } }), null);
    assert.equal(await db.matchPlayer.count({ where: { matchId: { in: [doomedReported, doomedPending] } } }), 0);
    assert.equal(await db.match.count({ where: { crewId: null } }), globalMatchesBefore, "no crew match may leak into the global archive as an orphan");
    for (const model of ["crewMember", "playerRatingVote", "crewInvitation", "crewRequest"]) assert.equal(await db[model].count({ where: { crewId: doomed.id } }), 0, model);
    // Career and season counters lose exactly what the deleted crew granted.
    assert.deepEqual(await counters(delMateA), { goals: 2, assists: 0, played: 1, motm: 1 });
    assert.deepEqual(await seasonLine(delMateA), { goals: 2, assists: 0, played: 1, motm: 1 });
    assert.deepEqual(await counters(delOwner), { goals: 0, assists: 0, played: 0, motm: 0 });
    assert.deepEqual(await seasonLine(delOwner), { goals: 0, assists: 0, played: 0, motm: 0 });
    assert.deepEqual(await counters(delCaptain), { goals: 0, assists: 0, played: 0, motm: 0 }, "the rewind is clamped at zero");
    assert.deepEqual(await counters(delMateB), { goals: 0, assists: 0, played: 1, motm: 0 });
    // Accounts, the other crew and its history are untouched.
    for (const person of [delOwner, delCaptain, delMateA, delMateB, delOutsider, delApplicant]) assert.notEqual(await db.user.findUnique({ where: { id: person.id } }), null);
    assert.equal(await db.crewMember.count({ where: { crewId: survivor.id } }), 4);
    assert.notEqual(await db.match.findUnique({ where: { id: survivorMatch } }), null);
    assert.equal(await db.playerRatingVote.count({ where: { crewId: survivor.id } }), 1);
    // Deleting twice is a clean refusal, not a crash.
    await assert.rejects(deleteCrewByOwner(db, delOwner.id, doomed.id, "Silinecek Ekip"), /bulunamadı/);


    console.log("PASS: global ratings, self-vote rejection, boundaries, update vs duplicate, concurrent averages, historical snapshots, crew peer voting rules, stat rollback on delete, crew data isolation, invitations, invite links, member removal with preserved history, contextual OVR, crew-scoped leaderboards, crew-only lineups and owner-only crew rename/delete with stat rewind.");

  } finally {
    if (createdSchema) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    rmSync(folder, { recursive: true, force: true });
  }
});
