import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createAuthAdapter } from "../lib/auth-adapter.ts";
import { createGlobalMatch, reportGlobalMatch } from "../lib/match-service.ts";
import { ratePlayer } from "../lib/rating-service.ts";

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

    const legacy = await db.user.findUniqueOrThrow({ where: { id: "legacy" }, include: { playerProfile: true, profiles: true } });
    assert.equal(legacy.role, "CAPTAIN");
    assert.equal(legacy.profiles.length, 1);
    assert.equal(legacy.playerProfile.goals, 3);
    assert.equal(legacy.playerProfile.position, "GK");
    const legacyMatch = await db.match.findUniqueOrThrow({ where: { id: "old-match" } });
    assert.equal(legacyMatch.status, "COMPLETED");
    // Existing matches keep the default team names after the crew/season upgrade.
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

    const scores = n => ({ pace: n, shooting: n, passing: n, dribbling: n, defending: n, physical: n });
    await assert.rejects(ratePlayer(db, user.id, profile.id, scores(90)), /Kendini/);
    await assert.rejects(ratePlayer(db, "missing-user", profile.id, scores(90)), /oturumu/);
    await assert.rejects(ratePlayer(db, extras[0].id, "missing-profile", scores(90)), /bulunamadı/);
    for (const value of [-1, 100, 3.5, null, "", NaN]) await assert.rejects(ratePlayer(db, extras[0].id, profile.id, { ...scores(60), pace: value }));
    // Ordinary PLAYER accounts may vote; identity/OVR fields in payload are ignored.
    await ratePlayer(db, extras[0].id, profile.id, { ...scores(0), ovrRating: 99, raterId: user.id });
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).ovrRating, 0);
    await ratePlayer(db, extras[1].id, profile.id, scores(99));
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).ovrRating, 49.5);
    await ratePlayer(db, extras[0].id, profile.id, scores(60));
    assert.equal(await db.playerRating.count({ where: { playerProfileId: profile.id } }), 2);
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).ovrRating, 79.5);
    await Promise.all([
      ratePlayer(db, extras[0].id, profile.id, scores(20)),
      ratePlayer(db, extras[1].id, profile.id, scores(80)),
      ratePlayer(db, legacy.id, profile.id, scores(50)),
    ]);
    assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).ovrRating, 50);
    await Promise.all([ratePlayer(db, extras[0].id, profile.id, scores(30)), ratePlayer(db, extras[0].id, profile.id, scores(90))]);
    const ratings = await db.playerRating.findMany({ where: { playerProfileId: profile.id } });
    assert.equal(ratings.length, 3);
    const ratedProfile = await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    assert.ok(Math.abs(ratedProfile.ovrRating - ratings.reduce((sum, row) => sum + row.pace, 0) / 3) < 1e-10);
    assert.equal(ratedProfile.goals, 1); assert.equal(ratedProfile.matchesPlayed, 1);
    assert.equal((await db.matchPlayer.findUniqueOrThrow({ where: { matchId_playerProfileId: { matchId: globalId, playerProfileId: profile.id } } })).ovrAtMatch, 0);
    await assert.rejects(db.playerRating.create({ data: { raterId: extras[0].id, playerProfileId: profile.id, ...scores(50) } }), { code: "P2002" });
    await assert.rejects(db.playerRating.update({ where: { id: ratings[0].id }, data: { pace: 100 } }));
    console.log("PASS: global ratings, self-vote rejection, boundaries, update vs duplicate, concurrent averages and historical snapshots.");
  } finally {
    if (createdSchema) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    rmSync(folder, { recursive: true, force: true });
  }
});