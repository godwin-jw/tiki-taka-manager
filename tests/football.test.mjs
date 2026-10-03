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

// --- position-aware snake ---------------------------------------------------
// The draft groups outfield players by position and deals each group as a
// block, so both squads get a fair share of DEF / MID / FWD instead of one
// side hoarding every forward.

const count = (draft, team, position) =>
  draft.filter(p => p.team === team && p.position === position).length;

test("each squad gets an equal share of every position", () => {
  // 2 keepers + 3 of each outfield position = 2 + 9 = 11 -> pad to 12.
  const squad = [
    ...Array.from({ length: 2 }, (_, i) => player(i, "GK")),
    ...Array.from({ length: 4 }, (_, i) => player(10 + i, "DEF")),
    ...Array.from({ length: 4 }, (_, i) => player(20 + i, "MID")),
    ...Array.from({ length: 2 }, (_, i) => player(30 + i, "FWD")),
  ];
  const draft = snakeDraft(squad);
  assert.equal(draft.filter(p => p.team === "A").length, 6);
  assert.equal(draft.filter(p => p.team === "B").length, 6);
  for (const position of ["GK", "DEF", "MID", "FWD"]) {
    assert.equal(
      count(draft, "A", position),
      count(draft, "B", position),
      `${position} must be split evenly`,
    );
  }
});

test("no squad takes three consecutive snake picks", () => {
  // 12 outfield players, no keepers: the snake must keep alternating.
  const draft = snakeDraft(Array.from({ length: 12 }, (_, i) => player(i, "MID")));
  const outfieldOrder = draft.filter(p => p.position !== "GK").map(p => p.team);
  for (let i = 2; i < outfieldOrder.length; i++) {
    assert.ok(
      !(outfieldOrder[i] === outfieldOrder[i - 1] && outfieldOrder[i] === outfieldOrder[i - 2]),
      `three in a row at index ${i}: ${outfieldOrder.join("")}`,
    );
  }
});

test("squad strength stays balanced for any mixed roster", () => {
  const positions = ["DEF", "DEF", "MID", "MID", "FWD", "FWD", "DEF", "MID", "FWD", "DEF"];
  const squad = [
    player(0, "GK"), player(1, "GK"),
    ...positions.map((position, i) => player(10 + i, position)),
  ];
  const draft = snakeDraft(squad);
  const average = team => {
    const squad_ = draft.filter(p => p.team === team);
    return squad_.reduce((sum, p) => sum + p.ovrRating, 0) / squad_.length;
  };
  // A gap above ~2 OVR means the elite all ended up on one side.
  assert.ok(Math.abs(average("A") - average("B")) <= 2, `OVR gap too large: ${average("A")} vs ${average("B")}`);
});

test("the draft is deterministic for identical input", () => {
  const squad = Array.from({ length: 10 }, (_, i) => player(i, i % 3 === 0 ? "DEF" : "MID"));
  const first = snakeDraft(squad).map(p => `${p.id}:${p.team}`);
  const second = snakeDraft([...squad].reverse()).map(p => `${p.id}:${p.team}`);
  assert.deepEqual(first.sort(), second.sort());
});