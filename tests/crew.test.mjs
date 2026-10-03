import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageCrew, crewSearchKey, sortByStats, CREW_MANAGERS, CREW_MEMBER_LIMIT } from "../lib/football.ts";
import { parseCrewName, parseCrewRequestMessage, text, ValidationError } from "../lib/validation.ts";

const form = (entries) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

test("only owners and captains may manage a crew", () => {
  assert.equal(canManageCrew("OWNER"), true);
  assert.equal(canManageCrew("CAPTAIN"), true);
  assert.equal(canManageCrew("MEMBER"), false);
  assert.equal(canManageCrew(null), false);
  assert.equal(canManageCrew(undefined), false);
  assert.deepEqual([...CREW_MANAGERS], ["OWNER", "CAPTAIN"]);
});

test("crew search ignores case and repeated whitespace", () => {
  assert.equal(crewSearchKey("  Kartal   SK  "), crewSearchKey("kartal sk"));
  assert.equal(crewSearchKey("\u00C7ayl\u0131"), crewSearchKey("\u00e7ayl\u0131"));
});

test("leaderboard sorts by the chosen metric then OVR then name", () => {
  const rows = [
    { name: "Bora", ovrRating: 70, goals: 5, assists: 1, motmCount: 0 },
    { name: "Ali", ovrRating: 80, goals: 5, assists: 1, motmCount: 0 },
    { name: "Cem", ovrRating: 90, goals: 1, assists: 9, motmCount: 4 },
  ];
  // Equal goals: higher OVR wins, so Ali precedes Bora.
  assert.deepEqual(sortByStats(rows, "goals").map(r => r.name), ["Ali", "Bora", "Cem"]);
  assert.deepEqual(sortByStats(rows, "assists").map(r => r.name), ["Cem", "Ali", "Bora"]);
  assert.deepEqual(sortByStats(rows, "ovrRating").map(r => r.name), ["Cem", "Ali", "Bora"]);
  assert.deepEqual(sortByStats(rows, "motmCount").map(r => r.name), ["Cem", "Ali", "Bora"]);
  // The helper must not mutate its input.
  assert.deepEqual(rows.map(r => r.name), ["Bora", "Ali", "Cem"]);
});

test("crew name is trimmed, collapsed and length checked", () => {
  assert.equal(parseCrewName(form({ name: "  Kartal   SK " })).name, "Kartal SK");
  assert.throws(() => parseCrewName(form({ name: "ab" })), ValidationError);
  assert.throws(() => parseCrewName(form({ name: "x".repeat(41) })), ValidationError);
});

test("crew request message is optional but bounded", () => {
  assert.equal(parseCrewRequestMessage(""), null);
  assert.equal(parseCrewRequestMessage(null), null);
  assert.equal(parseCrewRequestMessage("  forvet   oyuncusu "), "forvet oyuncusu");
  assert.throws(() => parseCrewRequestMessage("x"), ValidationError);
  assert.throws(() => parseCrewRequestMessage("x".repeat(201)), ValidationError);
});

test("crew member limit stays within a sensible range", () => {
  assert.equal(typeof CREW_MEMBER_LIMIT, "number");
  assert.ok(CREW_MEMBER_LIMIT >= 4 && CREW_MEMBER_LIMIT <= 100);
});

test("empty crew id is rejected before it reaches the database", () => {
  assert.throws(() => text("", "Ekip", 1, 100), ValidationError);
});