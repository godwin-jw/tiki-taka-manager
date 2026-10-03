export class ValidationError extends Error {}

export function text(value: unknown, label: string, min = 1, max = 100): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new ValidationError(`${label}: ${min}–${max} karakter kullanın.`);
  return value.trim();
}

export function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) throw new ValidationError(`${label} geçerli bir tam sayı olmalıdır.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new ValidationError(`${label}: ${min}–${max} arasında olmalıdır.`);
  return number;
}

export function parseProfile(form: FormData) {
  const name = text(form.get("name"), "İsim", 2, 60);
  const rawPhone = text(form.get("phone") ?? "", "Telefon", 0, 25);
  const phone = rawPhone.replace(/[\s()\-]/g, "") || null;
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) throw new ValidationError("Telefon 10–15 rakam içermelidir; ülke koduyla girebilirsiniz.");
  const position = form.get("position");
  if (position !== "GK" && position !== "DEF" && position !== "MID" && position !== "FWD") throw new ValidationError("Geçerli bir mevkii seçin.");
  const jersey = form.get("jerseyNumber");
  const jerseyNumber = jersey === "" || jersey === null ? null : integer(jersey, "Forma numarası", 1, 99);
  return { name, phone, position, jerseyNumber } as const;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Geçersiz form verisi.");
  return value as Record<string, unknown>;
}

export function jsonField(form: FormData, key: string): unknown {
  const raw = text(form.get(key), "Form verisi", 2, 20000);
  try { return JSON.parse(raw) as unknown; } catch { throw new ValidationError("Form verisi okunamadı."); }
}

/**
 * Normalises a user-supplied team name.
 *
 * Blank input falls back to the platform default, so the field can simply be
 * cleared instead of being forced to type something. Control characters and
 * angle brackets are stripped because team names are rendered inside links and
 * inline on the tactical board.
 */
export function teamName(value: unknown, side: "A" | "B"): string {
  const fallback = side === "A" ? "A Takımı" : "B Takımı";
  if (typeof value !== "string") return fallback;
  // Collapse whitespace FIRST, then drop what is left: reversing the order would
  // delete the separator and silently glue words together ("Boğaz\tKaptanları"
  // would become "BoğazKaptanları" instead of "Boğaz Kaptanları").
  const collapsed = value.replace(/\s+/g, " ").replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "");
  const cleaned = collapsed.trim();
  if (cleaned.length === 0) return fallback;
  if (cleaned.length > 30) throw new ValidationError("Takım adı en fazla 30 karakter olabilir.");
  return cleaned;
}

export function parseLineup(value: unknown) {
  if (!Array.isArray(value) || value.length < 4 || value.length > 22 || value.length % 2 !== 0) throw new ValidationError("4–22 arasında çift sayıda oyuncu seçin.");
  const rows = value.map(item => {
    const row = record(item);
    const id = text(row.id, "Oyuncu", 1, 100);
    const team = row.team;
    const position = row.position;
    if (team !== "A" && team !== "B") throw new ValidationError("Geçersiz takım.");
    if (position !== "GK" && position !== "DEF" && position !== "MID" && position !== "FWD") throw new ValidationError("Geçersiz mevkii.");
    return { id, team, position } as const;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new ValidationError("Oyuncular tekrar edemez.");
  for (const team of ["A", "B"]) {
    const squad = rows.filter(row => row.team === team);
    if (squad.length !== rows.length / 2) throw new ValidationError("Takımlarda eşit sayıda oyuncu olmalıdır.");
    if (squad.filter(row => row.position === "GK").length > 1) throw new ValidationError("Her takımda en fazla bir kaleci olabilir.");
  }
  return rows;
}

export function parseCrewName(form: FormData) {
  const name = text(form.get("name"), "Ekip adı", 3, 40);
  // Collapse repeated spaces so "A  Takımı" and "A Takımı" are the same crew.
  return { name: name.replace(/\s+/g, " ") };
}

export function parseCrewRequestMessage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const message = text(value, "Mesaj", 2, 200);
  return message.replace(/\s+/g, " ");
}

export function parseReport(value: unknown) {
  const data = record(value);
  const scoreA = integer(data.scoreA, "A takımı skoru", 0, 99);
  const scoreB = integer(data.scoreB, "B takımı skoru", 0, 99);
  const motmId = text(data.motmId, "Maçın adamı", 1, 100);
  if (!Array.isArray(data.players) || data.players.length < 4 || data.players.length > 22) throw new ValidationError("Geçersiz kadro.");
  const players = data.players.map(item => {
    const row = record(item);
    return { id: text(row.id, "Oyuncu", 1, 100), goals: integer(row.goals, "Gol", 0, 99), assists: integer(row.assists, "Asist", 0, 99) };
  });
  if (new Set(players.map(p => p.id)).size !== players.length) throw new ValidationError("Oyuncular tekrar edemez.");
  if (!players.some(p => p.id === motmId)) throw new ValidationError("Maçın adamı kadrodan seçilmelidir.");
  return { scoreA, scoreB, motmId, players };
}