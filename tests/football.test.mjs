import assert from "node:assert/strict";
import { test } from "node:test";
import { matchResult, ratingTier, snakeDraft } from "../lib/football.ts";

test("OVR tiers use exact gold/silver/bronze boundaries", () => {
  assert.equal(ratingTier(85), "gold"); assert.equal(ratingTier(84.9), "silver");
  assert.equal(ratingTier(75), "silver"); assert.equal(ratingTier(74.9), "bronze");
});
test("form is calculated from the player's own team", () => {
  assert.equal(matchResult("A", 3, 2), "W"); assert.equal(matchResult("B", 3, 2), "L");
  assert.equal(matchResult("B", 2, 2), "D");
});
const player = (i, position = "MID") => ({ id: `${i}`, userId: `${i}`, name: `Player ${i}`, image: null, position, ovrRating: 99 - i, form: [] });
test("snake order is A B B A A B B A without mutating input", () => {
  const players = Array.from({ length: 8 }, (_, i) => player(i));
  assert.deepEqual(snakeDraft(players).map(p => p.team), ["A", "B", "B", "A", "A", "B", "B", "A"]);
  assert.equal(players[0].team, undefined);
});
test("all supported sizes keep equal teams and opposing goalkeepers", () => {
  for (let size = 4; size <= 22; size += 2) for (let gks = 0; gks <= 2; gks++) {
    const draft = snakeDraft(Array.from({ length: size }, (_, i) => player(i, i < gks ? "GK" : "MID")));
    assert.equal(draft.filter(p => p.team === "A").length, size / 2);
    assert.equal(draft.filter(p => p.team === "B").length, size / 2);
    if (gks === 2) assert.notEqual(draft[0].team, draft[1].team);
  }
});
test("invalid counts, duplicates and extra keepers are rejected", () => {
  assert.throws(() => snakeDraft([player(1)]));
  assert.throws(() => snakeDraft([player(1), player(1), player(2), player(3)]));
  assert.throws(() => snakeDraft(Array.from({ length: 4 }, (_, i) => player(i, "GK"))));
});