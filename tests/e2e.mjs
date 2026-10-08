import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { generateInviteCode } from "../lib/validation.ts";

// No dedicated test database configured: start a throwaway PostgreSQL so the
// suite can always run. The application's DATABASE_URL is never touched.
let embedded = null;
if (!process.env.TEST_DATABASE_URL) {
  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const folder = mkdtempSync(path.join(tmpdir(), "tiki-e2e-"));
  const password = randomBytes(24).toString("base64url");
  const embeddedPort = 5437;
  embedded = new EmbeddedPostgres({ databaseDir: path.join(folder, "data"), user: "postgres", password, port: embeddedPort, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-c", "io_method=sync"], onLog: () => {}, onError: () => {} });
  await embedded.initialise();
  await embedded.start();
  process.env.TEST_DATABASE_URL = `postgresql://postgres:${password}@localhost:${embeddedPort}/postgres?schema=public`;
  process.env.NEXTAUTH_SECRET = randomBytes(32).toString("base64");
  embedded.folder = folder;
}
const schema = `e2e_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set("schema", schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const port = 3107;
const base = `http://localhost:${port}`;
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(), NEXTAUTH_URL: base };
let server, browser, createdSchema = false;
let serverLog = "";
mkdirSync("test-results", { recursive: true });

try {
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  createdSchema = true;
  execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: "pipe" });
  const captain = await db.user.create({ data: { name: "Test Captain", email: "captain@example.test", role: "CAPTAIN", playerProfile: { create: { position: "GK", ovrRating: 88 } } }, include: { playerProfile: true } });
  const player = await db.user.create({ data: { name: "Test Player", email: "player@example.test", playerProfile: { create: { position: "GK", ovrRating: 83 } } }, include: { playerProfile: true } });
  await Promise.all(Array.from({ length: 8 }, (_, i) => db.user.create({ data: { name: `Test Outfield ${i}`, email: `outfield${i}@example.test`, playerProfile: { create: { position: i < 3 ? "DEF" : i < 6 ? "MID" : "FWD", ovrRating: 80 - i } } } })));
  const captainToken = randomUUID();
  const playerToken = randomUUID();
  await db.session.createMany({ data: [{ sessionToken: captainToken, userId: captain.id, expires: new Date(Date.now() + 3600_000) }, { sessionToken: playerToken, userId: player.id, expires: new Date(Date.now() + 3600_000) }] });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", d => { serverLog += d; }); server.stderr.on("data", d => { serverLog += d; });
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/api/auth/providers`)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  assert.equal(ready, true, serverLog);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /Sadece oynama/ })).toBeVisible();
  await page.screenshot({ path: "test-results/welcome.png", fullPage: true });
  await page.goto(`${base}/profil`);
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  await context.addCookies([{ name: "next-auth.session-token", value: captainToken, url: base }]);
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gol Krallığı" })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.goto(`${base}/profil`);
  await page.getByLabel("Ad soyad").fill("Captain Updated");
  await page.getByLabel("Forma numarası").fill("10");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toHaveText("Profilin güncellendi.");
  assert.equal((await db.user.findUnique({ where: { id: captain.id } })).name, "Captain Updated");
  assert.equal((await db.playerProfile.findUnique({ where: { userId: captain.id } })).ovrRating, 88);
  await page.screenshot({ path: "test-results/profile.png", fullPage: true });
  // Match creation now requires an active crew. Keep the original draft ratings
  // as six-attribute ballots so this scenario still tests deterministic teams.
  const matchUsers = await db.user.findMany({ include: { playerProfile: true } });
  const matchCrew = await db.crew.create({ data: { name: "Match Crew", ownerId: captain.id, inviteCode: generateInviteCode(), members: { create: matchUsers.map(user => ({ userId: user.id, role: user.id === captain.id ? "OWNER" : "MEMBER" })) } } });
  await db.playerRatingVote.createMany({ data: matchUsers.map(user => {
    const score = user.playerProfile.ovrRating;
    return { crewId: matchCrew.id, voterId: user.id === captain.id ? player.id : captain.id, targetUserId: user.id, pace: score, shooting: score, passing: score, dribbling: score, defending: score, physical: score };
  }) });
  await context.addCookies([{ name: "activeCrewId", value: matchCrew.id, url: base }]);
  await page.goto(`${base}/yeni-mac`);
  await page.getByLabel("Toplam oyuncu").selectOption("10");
  const roster = page.locator("aside");
  for (const name of ["Captain Updated", "Test Player", ...Array.from({ length: 8 }, (_, i) => `Test Outfield ${i}`)]) await roster.getByRole("button", { name: new RegExp(`^${name},`) }).click();
  await page.getByRole("button", { name: "Takımları dengele" }).click();
  await expect(page.getByRole("heading", { name: "A Takımı", exact: false })).toBeVisible();
  const sourceCard = page.locator('[draggable="true"]').filter({ hasText: "Test Outfield 0" });
  const targetCard = page.locator('[draggable="true"]').filter({ hasText: "Test Outfield 1" });
  await sourceCard.dragTo(targetCard);
  await expect(page.getByRole("region", { name: "B takımı taktik tahtası" }).locator('[draggable="true"]').filter({ hasText: "Test Outfield 0" })).toBeVisible();
  await sourceCard.dragTo(targetCard);
  // Exercise keyboard/mobile alternative: move a player to the other team and back.
  await page.getByRole("button", { name: "Test Outfield 0 diğer takıma taşı" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "eşit" })).toBeVisible();
  await page.getByRole("button", { name: "Test Outfield 0 diğer takıma taşı" }).click();
  await page.getByLabel("Maç tarihi ve saati (yerel saat)").fill(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/tactical-pitch.png", fullPage: true });
  await page.getByRole("button", { name: "Kadroyu onayla ve maçı oluştur" }).click();
  await expect(page).toHaveURL(/\/mac\/[^/]+$/);
  const matchId = new URL(page.url()).pathname.split("/")[2];
  const match = await db.match.findUniqueOrThrow({ where: { id: matchId }, include: { players: { include: { playerProfile: { include: { user: true } } } } } });
  assert.equal(match.players.length, 10);
  assert.equal(match.players.filter(p => p.team === "A").length, 5);
  await page.getByRole("link", { name: "Maç raporunu gir" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const scorer = match.players.find(p => p.team === "A");
  const scorerName = scorer.playerProfile.user.name;
  await page.getByLabel("TAKIM A", { exact: true }).fill("1");
  await page.getByRole("button", { name: `${scorerName} gol artır`, exact: true }).click();
  await page.getByRole("radio", { name: `${scorerName} maçın adamı`, exact: true }).check();
  await page.getByRole("checkbox", { name: /Sonuçları kontrol ettim/ }).check();
  await page.getByRole("button", { name: "Raporu onayla", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/mac/${matchId}$`));
  await expect(page.getByText("RAPOR ONAYLANDI", { exact: true })).toBeVisible();
  const stats = await db.playerProfile.findUniqueOrThrow({ where: { id: scorer.playerProfileId } });
  assert.equal(stats.goals, 1); assert.equal(stats.matchesPlayed, 1); assert.equal(stats.motmCount, 1);
  await page.goto(`${base}/mac/${matchId}/rapor`);
  await expect(page).toHaveURL(new RegExp(`/mac/${matchId}$`));
  await page.goto(base);
  await expect(page.getByRole("region", { name: "Liderlik tabloları" }).getByText(scorerName)).toHaveCount(2);
  await page.screenshot({ path: "test-results/dashboard-reported.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Oyuncu havuzunu aç" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Oyuncu Profilim" }).click();
  await expect(page).toHaveURL(/\/profil$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: "test-results/profile-mobile.png", fullPage: true });
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await playerContext.addCookies([{ name: "next-auth.session-token", value: playerToken, url: base }]);
  const playerPage = await playerContext.newPage();
  await playerPage.goto(`${base}/yeni-mac`);
  await expect(playerPage.getByRole("heading", { name: "Takımının kaptanı ol." })).toBeVisible();
  // The global roster opens a read-only card; former members cannot vote.
  await db.crewMember.delete({ where: { crewId_userId: { crewId: matchCrew.id, userId: player.id } } });
  await playerPage.getByRole("button", { name: "Oyuncu havuzunu aç" }).click();
  await playerPage.getByRole("dialog").getByRole("link", { name: "Captain Updated profilini aç" }).click();
  await expect(playerPage).toHaveURL(new RegExp(`/oyuncu/${captain.id}$`));
  await expect(playerPage.getByRole("dialog")).toHaveCount(0);
  await expect(playerPage.getByRole("button", { name: "Captain Updated için işlemler" })).toHaveCount(0);
  await expect(playerPage.getByRole("region", { name: "Ekip değerlendirmesi" })).toContainText("— OVR");

  const ratingCrew = await db.crew.create({ data: { name: "Rating Crew", ownerId: captain.id, inviteCode: generateInviteCode(), members: { create: [{ userId: captain.id, role: "OWNER" }, { userId: player.id }] } } });
  const inactiveCrew = await db.crew.create({ data: { name: "Other Rating Crew", ownerId: captain.id, inviteCode: generateInviteCode(), members: { create: [{ userId: captain.id, role: "OWNER" }, { userId: player.id }] } } });
  await playerContext.addCookies([{ name: "activeCrewId", value: ratingCrew.id, url: base }]);
  await context.addCookies([{ name: "activeCrewId", value: ratingCrew.id, url: base }]);
  await playerPage.reload();
  const openVote = async () => {
    await playerPage.getByRole("button", { name: "Captain Updated için işlemler" }).click();
    await playerPage.getByRole("menuitem", { name: "Oy ver", exact: true }).click();
    await expect(playerPage.getByRole("dialog")).toBeVisible();
  };
  await openVote();
  const labels = ["Hız (PAC)", "Şut (SHO)", "Pas (PAS)", "Dripling (DRI)", "Defans (DEF)", "Fizik (PHY)"];
  const values = [90, 80, 70, 60, 50, 40];
  await expect(playerPage.getByRole("spinbutton")).toHaveCount(6);
  for (let i = 0; i < labels.length; i++) await playerPage.getByRole("spinbutton", { name: labels[i], exact: true }).fill(String(values[i]));
  await expect(playerPage.getByLabel("Değerlendirme OVR önizlemesi")).toHaveText("65.0");
  // A modal left open when the workspace changes must not write to the old crew.
  await playerContext.addCookies([{ name: "activeCrewId", value: inactiveCrew.id, url: base }]);
  await playerPage.getByRole("button", { name: "Oyu kaydet" }).click();
  await expect(playerPage.getByRole("alert")).toContainText("aktif ekibindeki");
  assert.equal(await db.playerRatingVote.count({ where: { crewId: { in: [ratingCrew.id, inactiveCrew.id] } } }), 0);
  await playerContext.addCookies([{ name: "activeCrewId", value: ratingCrew.id, url: base }]);
  await playerPage.getByRole("button", { name: "Oyu kaydet" }).click();
  await expect(playerPage.getByRole("dialog")).toHaveCount(0);
  await expect(playerPage.getByRole("region", { name: "Ekip değerlendirmesi" })).toContainText("65.0 OVR");
  assert.equal((await db.playerProfile.findUniqueOrThrow({ where: { id: captain.playerProfile.id } })).ovrRating, 88);
  assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await playerPage.screenshot({ path: "test-results/player-rating-mobile.png", fullPage: true });

  // The roster uses the same ballot and edits the same row.
  await playerPage.goto(`${base}/ekip/${ratingCrew.id}`);
  await openVote();
  await expect(playerPage.getByRole("spinbutton", { name: "Hız (PAC)", exact: true })).toHaveValue("90");
  for (const label of labels) await playerPage.getByRole("spinbutton", { name: label, exact: true }).fill("99");
  await playerPage.getByRole("button", { name: "Oyu kaydet" }).click();
  await expect(playerPage.getByRole("dialog")).toHaveCount(0);
  assert.equal(await db.playerRatingVote.count({ where: { crewId: ratingCrew.id, targetUserId: captain.id } }), 1);
  assert.equal(await db.playerRating.count(), 0, "the legacy global rating channel must stay unused");
  await openVote();
  await expect(playerPage.getByRole("spinbutton", { name: "Hız (PAC)", exact: true })).toHaveValue("99");
  await playerPage.getByRole("button", { name: "Vazgeç" }).click();
  await playerPage.goto(`${base}/ekip/${inactiveCrew.id}`);
  await expect(playerPage.getByRole("button", { name: "Captain Updated için işlemler" })).toHaveCount(0);
  await playerPage.goto(`${base}/profil/${captain.id}`);
  await expect(playerPage.getByRole("region", { name: "Ekip değerlendirmesi" })).toContainText("99.0 OVR");
  await expect(playerPage.getByRole("spinbutton")).toHaveCount(0);
  await expect(playerPage.getByRole("button", { name: "Captain Updated için işlemler" })).toHaveCount(0);
  await page.goto(`${base}/oyuncu/${captain.id}`);
  await expect(page.getByText("Kendine oy veremezsin.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Captain Updated için işlemler" })).toHaveCount(0);
  await page.goto(`${base}/profil`);
  await expect(page.getByRole("region", { name: "Ekip değerlendirmesi" })).toContainText("99.0 OVR");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/oyuncu/${player.id}`);
  await expect(page.getByRole("heading", { name: "Test Player", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/player-rating-desktop.png", fullPage: true });
  assert.equal((await db.matchPlayer.findUniqueOrThrow({ where: { matchId_playerProfileId: { matchId, playerProfileId: captain.playerProfile.id } } })).ovrAtMatch, 88);
  await playerPage.goto(`${base}/profil`);
  await playerPage.getByRole("checkbox", { name: /Kadroları ve maç sonuçlarını/ }).check();
  await playerPage.getByRole("button", { name: "Kaptanlık yetkisini al" }).click();
  await expect(playerPage.getByRole("heading", { name: "Kaptanlık yetkin aktif" })).toBeVisible();
  await playerPage.goto(`${base}/mac/${matchId}/rapor`);
  await expect(playerPage).toHaveURL(new RegExp(`/mac/${matchId}$`));
  assert.deepEqual(errors, []);

  // ---- Invitations and invite-link onboarding -----------------------------
  // A captain creates a crew from the UI, which must mint an invite code.
  await page.goto(`${base}/ekipler`);
  // The crew name field also appears in the join form, so scope to the create panel.
  await page.locator("form").filter({ hasText: "Ekipi sen kurduğunda" }).getByLabel("Ekip adı").fill("Davet Ekipi");
  await page.getByRole("button", { name: /^Ekip kur$/ }).click();
  await expect(page).toHaveURL(/\/ekip\/.+/);
  const crewId = page.url().split("/ekip/")[1].split("?")[0];
  const crew = await db.crew.findUniqueOrThrow({ where: { id: crewId } });
  assert.match(crew.inviteCode, /^[34679ACDEFGHJKMNPQRTUVWXY]{8}$/, "creating a crew must mint an 8-character code");

  // The share link is shown to the captain and points at /davet/<code>.
  const inviteField = page.getByLabel("Davet bağlantısı");
  await expect(inviteField).toHaveValue(`/davet/${crew.inviteCode}`);

  // An in-app invitation: the captain searches for a registered player.
  await page.getByRole("button", { name: /Oyuncu Davet Et/ }).click();
  const inviteDialog = page.getByRole("dialog");
  await inviteDialog.getByLabel("Oyuncu ara").fill("Test Player");
  await expect(page.getByRole("button", { name: /^Davet gönder$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Davet gönder$/ }).first().click();
  await expect(page.getByText(/Davet gönderildi/)).toBeVisible();
  const invitation = await db.crewInvitation.findFirstOrThrow({ where: { crewId, receiverId: player.id } });
  assert.equal(invitation.status, "PENDING");

  // The receiver sees the invitation in their inbox and can accept it.
  await playerPage.goto(`${base}/ekip/${crewId}`);
  await expect(playerPage.getByText(/ekibine davet edildin/)).toBeVisible();
  await playerPage.getByRole("button", { name: /Kabul et/ }).click();
  await expect(playerPage).toHaveURL(new RegExp(`/ekip/${crewId}\\?katildi=1`));
  assert.notEqual(await db.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: player.id } } }), null);
  assert.equal((await db.crewInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status, "ACCEPTED");

  // A signed-out visitor is sent to sign-in with the invite link as callbackUrl.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${base}/davet/${crew.inviteCode}`);
  await expect(guestPage).toHaveURL(/\/api\/auth\/signin\?callbackUrl=/);
  assert.match(guestPage.url(), /callbackUrl=%2Fdavet%2F/, "the invite link must survive the sign-in round trip");
  await guest.close();

  // A signed-in outsider following the link joins the crew automatically.
  const joiner = await db.user.create({ data: { name: "Link Joiner", email: `joiner-${randomUUID()}@example.test` } });
  const joinerToken = randomUUID();
  await db.session.create({ data: { sessionToken: joinerToken, userId: joiner.id, expires: new Date(Date.now() + 3600_000) } });
  const joinerContext = await browser.newContext();
  await joinerContext.addCookies([{ name: "next-auth.session-token", value: joinerToken, url: base }]);
  const joinerPage = await joinerContext.newPage();
  await joinerPage.goto(`${base}/davet/${crew.inviteCode.toLowerCase()}`);
  await expect(joinerPage).toHaveURL(new RegExp(`/ekip/${crewId}\\?katildi=1`), { timeout: 15_000 });
  await expect(joinerPage.getByText(/başarıyla katıldın/)).toBeVisible();
  assert.notEqual(await db.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: joiner.id } } }), null);
  // Re-opening the same link is a no-op rather than a duplicate membership.
  await joinerPage.goto(`${base}/davet/${crew.inviteCode}`);
  await expect(joinerPage).toHaveURL(new RegExp(`/ekip/${crewId}\\?katildi=0`));
  assert.equal(await db.crewMember.count({ where: { crewId, userId: joiner.id } }), 1);
  // The link page is not shown to a non-member.
  await expect(joinerPage.getByLabel("Davet bağlantısı")).toHaveCount(0);
  await joinerContext.close();

  // An unknown code lands on the friendly invalid page, not a crash.
  await page.goto(`${base}/davet/AAAAAAAA`);
  await expect(page.getByRole("heading", { name: /Davet linki geçersiz/ })).toBeVisible();
  await page.screenshot({ path: "test-results/invite-invalid.png", fullPage: true });
  // A malformed code is routed to the same page instead of throwing.
  await page.goto(`${base}/davet/bad`);
  await expect(page.getByRole("heading", { name: /Davet linki geçersiz/ })).toBeVisible();

  console.log("PASS: guest protection, profile, captain role, roster, draft, transfers, match creation, report, leaderboard, mobile menu, layout, in-app invitations and invite-link onboarding.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => { server.once("exit", resolve); setTimeout(resolve, 3000); }); }
  if (createdSchema) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
  // Only tear down the throwaway database this run created for itself.
  if (embedded) {
    await embedded.stop();
    rmSync(embedded.folder, { recursive: true, force: true });
  }
}