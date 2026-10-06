export const positions = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof positions)[number];
export type Team = "A" | "B";
export type FormResult = "W" | "D" | "L";
export type RosterPlayer = {
  id: string; userId: string; name: string; image: string | null;
  position: Position; ovrRating: number; form: FormResult[];
  /**
   * True when this crew has not rated the player yet, so `ovrRating` is the
   * neutral seed rather than an actual verdict. Optional because a global
   * roster has no crew to be unrated within.
   */
  isUnrated?: boolean;
};
export type DraftPlayer = RosterPlayer & { team: Team; position: Position };
/**
 * Result of a Server Action render.
 *
 * `results` carries optional structured payloads for inline widgets (the invite
 * search box); keeping them on the shared state avoids a second parallel state
 * channel just for search suggestions.
 */
export type ActionState = { error?: string; success?: string; results?: unknown };
export const positionLabels: Record<Position, string> = { GK: "Kaleci", DEF: "Defans", MID: "Orta saha", FWD: "Forvet" };

export function ratingTier(ovr: number) {
  return ovr >= 85 ? "gold" : ovr >= 75 ? "silver" : "bronze";
}

export function matchResult(team: Team, scoreA: number, scoreB: number): FormResult {
  if (scoreA === scoreB) return "D";
  return (team === "A" ? scoreA > scoreB : scoreB > scoreA) ? "W" : "L";
}

/**
 * Snake draft with position awareness.
 *
 * Order of operations:
 *  1. Goalkeepers are split across the two squads first, so neither team can
 *     start without a keeper. A third keeper is rejected.
 *  2. The remaining players are grouped by position (DEF, then MID, then FWD);
 *     inside a group they are ordered strongest-first.
 *  3. Groups are then dealt out using the classic A-B-B-A snake. The pick
 *     counter keeps running across group boundaries, so the snake never
 *     restarts and neither squad ever receives two picks in a row.
 *
 * Guarantees (all covered by tests):
 *  - squads are always exactly the same size;
 *  - the draft order is deterministic and the input array is never mutated;
 *  - positions are dealt fairly because each group is dealt as a block.
 */
export function snakeDraft(players: RosterPlayer[]): DraftPlayer[] {
  if (players.length < 4 || players.length > 22 || players.length % 2 !== 0) throw new Error("4–22 arasında çift sayıda oyuncu seçin.");
  if (new Set(players.map(p => p.id)).size !== players.length) throw new Error("Bir oyuncu iki kez seçilemez.");
  const ordered = [...players].sort((a, b) => b.ovrRating - a.ovrRating || a.id.localeCompare(b.id));
  const keepers = ordered.filter(p => p.position === "GK");
  if (keepers.length > 2) throw new Error("En fazla iki kaleci seçin; diğer oyuncuların ana mevkisini güncellğin.");
  const capacity = players.length / 2;
  const result: DraftPlayer[] = [];
  const size = (team: Team) => result.filter(p => p.team === team).length;
  const place = (player: RosterPlayer, team: Team) => { result.push({ ...player, team }); };

  // Step 1: one keeper per team.
  if (keepers.length >= 1) place(keepers[0], "A");
  if (keepers.length === 2) place(keepers[1], "B");

  // Step 2: group the outfield players by position, strongest first inside
  // each group. Groups are dealt in DEF -> MID -> FWD order.
  const outfield = ordered.filter(p => p.position !== "GK");
  const groups: Position[] = ["DEF", "MID", "FWD"];
  const queue: RosterPlayer[] = [];
  for (const position of groups) queue.push(...outfield.filter(p => p.position === position));

  // Step 3: deal the queue with one continuous A-B-B-A snake.
  queue.forEach((player, index) => {
    const preferred: Team = index % 4 === 0 || index % 4 === 3 ? "A" : "B";
    const fallback: Team = preferred === "A" ? "B" : "A";
    // Fall back to the other squad only when the preferred one is already full,
    // which keeps both squads exactly the same size.
    if (size(preferred) < capacity) place(player, preferred);
    else place(player, fallback);
  });
  return result;
}
// Crew domain rules. Shared by the pages and the server actions so membership
// and captain permissions are decided in exactly one place.
// ---------------------------------------------------------------------------

/**
 * Hierarchy inside a crew: OWNER > CAPTAIN > CO_CAPTAIN > MEMBER.
 *
 * CO_CAPTAIN ("kaptan yardımcısı") carries the pitch-side powers of a captain
 * (matches, invites, join requests, roster management) but never the owner's
 * crown: only the OWNER may grant or revoke it, remove an officer, or change
 * the crew's owner.
 */
export type CrewRoleName = "OWNER" | "CAPTAIN" | "CO_CAPTAIN" | "MEMBER";

/** Roles allowed to review join requests, invite players and manage the roster. */
export const CREW_MANAGERS: readonly CrewRoleName[] = ["OWNER", "CAPTAIN", "CO_CAPTAIN"];

export function canManageCrew(role: CrewRoleName | null | undefined): boolean {
  return role !== null && role !== undefined && CREW_MANAGERS.includes(role);
}

/**
 * Lower-cased, whitespace-collapsed key used for case-insensitive crew search
 * on both Turkish and Latin text ("Kartal SK" and "kartalsk" must match).
 */
export function crewSearchKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** Maximum members per crew; keeps the draft pools usable for a 5-a-side game. */
export const CREW_MEMBER_LIMIT = 30;

/**
 * Orders crew leaderboard rows by a chosen metric. Ties fall back to OVR and
 * then the Turkish name so the table never reorders between renders.
 */
export function sortByStats<T extends { name: string; ovrRating: number }>(
  rows: T[],
  metric: "ovrRating" | "goals" | "assists" | "motmCount",
): T[] {
  const value = (row: T) => (metric === "ovrRating" ? row.ovrRating : (row as unknown as Record<string, number>)[metric] ?? 0);
  return [...rows].sort((a, b) => value(b) - value(a) || b.ovrRating - a.ovrRating || a.name.localeCompare(b.name, "tr-TR"));
}

export function teamAverage(players: Pick<DraftPlayer, "team" | "ovrRating">[], team: Team) {
  const squad = players.filter(p => p.team === team);
  return squad.length ? squad.reduce((sum, p) => sum + p.ovrRating, 0) / squad.length : 0;
}