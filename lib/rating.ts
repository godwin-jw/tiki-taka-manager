import { integer, record } from "./validation.ts";

export const ratingAttributes = [
  { key: "pace", label: "Hız", code: "PAC", description: "Hızlanma ve sprint" },
  { key: "shooting", label: "Şut", code: "SHO", description: "Bitiricilik, şut gücü ve isabet" },
  { key: "passing", label: "Pas", code: "PAS", description: "Pas isabeti, görüş ve oyun kurma" },
  { key: "dribbling", label: "Dripling", code: "DRI", description: "Top kontrolü, çeviklik ve çalım" },
  { key: "defending", label: "Defans", code: "DEF", description: "Markaj, top kapma ve pozisyon alma" },
  { key: "physical", label: "Fizik", code: "PHY", description: "Güç, dayanıklılık ve ikili mücadele" },
] as const;
export type RatingAttribute = (typeof ratingAttributes)[number]["key"];
export type AttributeScores = Record<RatingAttribute, number>;

export function parseRating(input: unknown): AttributeScores {
  const values = record(input);
  return {
    pace: integer(values.pace, "Hız", 0, 99),
    shooting: integer(values.shooting, "Şut", 0, 99),
    passing: integer(values.passing, "Pas", 0, 99),
    dribbling: integer(values.dribbling, "Dripling", 0, 99),
    defending: integer(values.defending, "Defans", 0, 99),
    physical: integer(values.physical, "Fizik", 0, 99),
  };
}

export function overallRating(scores: AttributeScores): number {
  return ratingAttributes.reduce((sum, attr) => sum + scores[attr.key], 0) / ratingAttributes.length;
}

export function averageScores(averages: Record<RatingAttribute, number | null>): AttributeScores {
  return { pace: averages.pace ?? 0, shooting: averages.shooting ?? 0, passing: averages.passing ?? 0, dribbling: averages.dribbling ?? 0, defending: averages.defending ?? 0, physical: averages.physical ?? 0 };
}

/**
 * Crew stat-vote averaging for the contextual OVR.
 *
 * Votes are stored per crew, so two players who share two crews can hold two rows
 * for the same pair. Counting rows would let one teammate weigh twice, so votes
 * are collapsed per voter first: the most recently updated vote wins.
 *
 * Returns null when nobody has voted yet, which lets callers fall back to the
 * stored OVR instead of rendering a misleading zero.
 */
export function averagePeerStats(
  votes: ReadonlyArray<{ voterId: string; updatedAt?: Date } & Partial<AttributeScores>>,
): { scores: AttributeScores; count: number } | null {
  const latestPerVoter = new Map<string, { voterId: string; updatedAt: number } & Partial<AttributeScores>>();
  for (const vote of votes) {
    const at = vote.updatedAt ? vote.updatedAt.getTime() : 0;
    const current = latestPerVoter.get(vote.voterId);
    // Ties fall back to the later element so the newest row always wins.
    if (!current || at >= current.updatedAt) latestPerVoter.set(vote.voterId, { ...vote, updatedAt: at });
  }
  if (latestPerVoter.size === 0) return null;
  const scores = {} as AttributeScores;
  for (const attr of ratingAttributes) {
    let total = 0;
    for (const vote of latestPerVoter.values()) total += vote[attr.key] ?? 0;
    scores[attr.key] = total / latestPerVoter.size;
  }
  return { scores, count: latestPerVoter.size };
}

/** Clamps an OVR into the 0-99 range used by both the schema and the UI. */
export function clampOvr(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99, Math.max(0, Math.round(value)));
}