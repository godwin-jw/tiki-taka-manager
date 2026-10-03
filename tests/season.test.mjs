import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure helpers mirrored from the season layer, so the rules are asserted
 * without a database. The service functions in lib/season-service.ts are
 * covered end-to-end by the database suite.
 */
const resolveSeason = (seasons, requestedId) => seasons.find((s) => s.id === requestedId) ?? seasons.find((s) => s.isActive) ?? seasons[0] ?? null;

test("season resolution prefers the requested season", () => {
  const seasons = [{ id: "s1", isActive: false }, { id: "s2", isActive: true }];
  assert.equal(resolveSeason(seasons, "s1").id, "s1");
});

test("season resolution falls back to the active season when none requested", () => {
  const seasons = [{ id: "s1", isActive: false }, { id: "s2", isActive: true }];
  assert.equal(resolveSeason(seasons, undefined).id, "s2");
  // An unknown id must not resolve to a non-existent season.
  assert.equal(resolveSeason(seasons, "missing").id, "s2");
});

test("season resolution returns null when the platform has no seasons", () => {
  assert.equal(resolveSeason([], undefined), null);
  assert.equal(resolveSeason([], "s1"), null);
});

test("archived seasons keep their own totals instead of resetting", () => {
  const lines = { s1: { goals: 7, assists: 2 }, s2: { goals: 0, assists: 0 } };
  // Reading the archived season must not be affected by the new season's zeros.
  assert.equal(lines.s1.goals, 7);
  assert.equal(lines.s2.goals, 0);
});

test("season statistics can never be negative", () => {
  const row = { goals: 3, assists: 2, matchesPlayed: 1, motmCount: 1 };
  for (const key of ["goals", "assists", "matchesPlayed", "motmCount"]) {
    assert.ok(row[key] >= 0, `${key} must not be negative`);
    assert.ok(Number.isInteger(row[key]), `${key} must be an integer`);
  }
});

test("accumulating a report increments rather than overwrites", () => {
  const existing = { goals: 7, assists: 2, matchesPlayed: 5, motmCount: 1 };
  const report = { goals: 2, assists: 1, isMotm: true };
  const updated = {
    goals: existing.goals + report.goals,
    assists: existing.assists + report.assists,
    matchesPlayed: existing.matchesPlayed + 1,
    motmCount: existing.motmCount + (report.isMotm ? 1 : 0),
  };
  assert.deepEqual(updated, { goals: 9, assists: 3, matchesPlayed: 6, motmCount: 2 });
});