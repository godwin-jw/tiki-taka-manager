import assert from "node:assert/strict";
import { test } from "node:test";
import { integer, parseProfile, parseLineup, parseReport } from "../lib/validation.ts";
const form = () => { const f = new FormData(); f.set("name", "  Ada Yılmaz "); f.set("position", "MID"); return f; };
test("profile update whitelists editable fields, never role or stats", () => {
  const f = form(); f.set("ovrRating", "99"); f.set("goals", "900"); f.set("role", "CAPTAIN"); f.set("userId", "someone-else");
  assert.deepEqual(parseProfile(f), { name: "Ada Yılmaz", phone: null, position: "MID", jerseyNumber: null });
});

test("lineup rejects duplicates, uneven teams, invalid positions and stacked keepers", () => {
  const lineup = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, team: i < 2 ? "A" : "B", position: "MID" }));
  assert.equal(parseLineup(lineup).length, 4);
  for (const mutate of [rows => { rows[1].id = rows[0].id; }, rows => { rows[2].team = "A"; }, rows => { rows[0].position = "ADMIN"; }, rows => { rows[0].position = "GK"; rows[1].position = "GK"; }]) {
    const invalid = structuredClone(lineup); mutate(invalid); assert.throws(() => parseLineup(invalid));
  }
});

test("report rejects invalid numbers, duplicate players and non-participant MOTM", () => {
  const report = { scoreA: 0, scoreB: 0, motmId: "0", players: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, goals: 0, assists: 0 })) };
  assert.equal(parseReport(report).players.length, 4);
  assert.throws(() => parseReport({ ...report, motmId: "outside" }));
  assert.throws(() => parseReport({ ...report, scoreA: 1.5 }));
  assert.throws(() => parseReport({ ...report, players: [...report.players.slice(0, 3), report.players[0]] }));
});
test("profile validates number, name, position and normalizes phone", () => {
  const f = form(); f.set("phone", "+90 (555) 123-45-67"); f.set("jerseyNumber", "10");
  assert.equal(parseProfile(f).phone, "+905551234567");
  for (const [key, value] of [["name", " "], ["phone", "abc"], ["position", "ADMIN"], ["jerseyNumber", "100"]]) { const invalid = form(); invalid.set(key, value); assert.throws(() => parseProfile(invalid)); }
  for (const value of [null, "", "1.5", "NaN", -1, Infinity]) assert.throws(() => integer(value, "Skor", 0, 99));
});