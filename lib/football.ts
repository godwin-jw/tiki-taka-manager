export const positions = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof positions)[number];
export type Team = "A" | "B";
export type FormResult = "W" | "D" | "L";
export type RosterPlayer = {
  id: string; userId: string; name: string; image: string | null;
  position: Position; ovrRating: number; form: FormResult[];
};
export type DraftPlayer = RosterPlayer & { team: Team; position: Position };
export type ActionState = { error?: string; success?: string };
export const positionLabels: Record<Position, string> = { GK: "Kaleci", DEF: "Defans", MID: "Orta saha", FWD: "Forvet" };

export function ratingTier(ovr: number) {
  return ovr >= 85 ? "gold" : ovr >= 75 ? "silver" : "bronze";
}

export function matchResult(team: Team, scoreA: number, scoreB: number): FormResult {
  if (scoreA === scoreB) return "D";
  return (team === "A" ? scoreA > scoreB : scoreB > scoreA) ? "W" : "L";
}

export function snakeDraft(players: RosterPlayer[]): DraftPlayer[] {
  if (players.length < 4 || players.length > 22 || players.length % 2 !== 0) throw new Error("4–22 arasında çift sayıda oyuncu seçin.");
  if (new Set(players.map(p => p.id)).size !== players.length) throw new Error("Bir oyuncu iki kez seçilemez.");
  const ordered = [...players].sort((a, b) => b.ovrRating - a.ovrRating || a.id.localeCompare(b.id));
  const keepers = ordered.filter(p => p.position === "GK");
  if (keepers.length > 2) throw new Error("En fazla iki kaleci seçin; diğer oyuncuların ana mevkisini güncelleyin.");
  const result: DraftPlayer[] = keepers.map((p, i) => ({ ...p, team: i === 0 ? "A" : "B" }));
  const capacity = players.length / 2;
  ordered.filter(p => p.position !== "GK").forEach((p, i) => {
    let team: Team = i % 4 === 0 || i % 4 === 3 ? "A" : "B";
    if (result.filter(p => p.team === team).length >= capacity) team = team === "A" ? "B" : "A";
    result.push({ ...p, team });
  });
  return result;
}

export function teamAverage(players: Pick<DraftPlayer, "team" | "ovrRating">[], team: Team) {
  const squad = players.filter(p => p.team === team);
  return squad.length ? squad.reduce((sum, p) => sum + p.ovrRating, 0) / squad.length : 0;
}