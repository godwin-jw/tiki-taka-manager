import assert from "node:assert/strict";
import { test } from "node:test";
import { averagePeerStats, averageScores, clampOvr, overallRating, parseRating, ratingAttributes } from "../lib/rating.ts";

const scores = n => Object.fromEntries(ratingAttributes.map(a => [a.key, n]));
test("six rating attributes accept 0 and 99 and ignore client OVR/identity", () => {
  assert.deepEqual(parseRating(scores(0)), scores(0));
  assert.deepEqual(parseRating({ ...scores("99"), ovrRating: 1000, raterId: "fake" }), scores(99));
});
test("every rating attribute must be a complete 0-99 integer", () => {
  for (const attr of ratingAttributes) for (const value of [undefined, null, "", " ", -1, 100, 1.5, "abc", NaN, Infinity, true]) {
    assert.throws(() => parseRating({ ...scores(50), [attr.key]: value }));
  }
});
test("overall is the unrounded equal-weight mean of six attribute averages", () => {
  assert.equal(overallRating({ pace: 90, shooting: 80, passing: 70, dribbling: 60, defending: 50, physical: 40 }), 65);
  assert.equal(overallRating(scores(49.5)), 49.5);
  assert.deepEqual(averageScores(scores(null)), scores(0));
});

test("peer stats average the six attributes, and null when nobody voted", () => {
  assert.equal(averagePeerStats([]), null);
  assert.deepEqual(averagePeerStats([{ voterId: "a", ...scores(80) }]), { scores: scores(80), count: 1 });
  assert.deepEqual(
    averagePeerStats([{ voterId: "a", ...scores(80) }, { voterId: "b", ...scores(60) }]),
    { scores: scores(70), count: 2 },
  );
  assert.deepEqual(
    averagePeerStats([{ voterId: "a", ...scores(0) }, { voterId: "b", ...scores(99) }]),
    { scores: scores(49.5), count: 2 },
  );
});

test("one voter weighs once even when the pair shares several crews", () => {
  // The same voter appears twice (two crews); only the newest vote may count.
  const votes = [
    { voterId: "a", ...scores(100), updatedAt: new Date("2026-01-01") },
    { voterId: "a", ...scores(40), updatedAt: new Date("2026-02-01") },
    { voterId: "b", ...scores(60), updatedAt: new Date("2026-01-01") },
  ];
  assert.deepEqual(averagePeerStats(votes), { scores: scores(50), count: 2 });
  // Equal timestamps must still collapse to a single vote.
  const tied = [
    { voterId: "a", ...scores(10), updatedAt: new Date("2026-01-01") },
    { voterId: "a", ...scores(90), updatedAt: new Date("2026-01-01") },
  ];
  assert.deepEqual(averagePeerStats(tied), { scores: scores(90), count: 1 });
});

test("OVR clamping keeps the published value inside 0-99", () => {
  assert.equal(clampOvr(-5), 0);
  assert.equal(clampOvr(0), 0);
  assert.equal(clampOvr(99), 99);
  assert.equal(clampOvr(120), 99);
  assert.equal(clampOvr(72.4), 72);
  assert.equal(clampOvr(72.6), 73);
  assert.equal(clampOvr(NaN), 0);
});