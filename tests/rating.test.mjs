import assert from "node:assert/strict";
import { test } from "node:test";
import { averageScores, overallRating, parseRating, ratingAttributes } from "../lib/rating.ts";

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