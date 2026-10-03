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