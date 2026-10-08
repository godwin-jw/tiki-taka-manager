import { randomBytes } from "node:crypto";

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

/**
 * Normalises an optional crew scope.
 *
 * Absent, null, "" and whitespace all mean "no crew" (a legacy global match);
 * every new match passes the active crew resolved from the cookie. Any other
 * value must be a real id, so a crafted value cannot smuggle an arbitrary
 * string into the crewId column.
 */
export function optionalCrewId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ValidationError("Geçersiz ekip seçimi.");
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return text(trimmed, "Ekip", 1, 100);
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

/**
 * Validates and normalises a crew name (create AND rename share this rule, so a
 * crew can never be renamed to something it could not have been created with).
 * Accepts `unknown` because Server Action arguments are attacker-controlled.
 */
export function normalizeCrewName(value: unknown): string {
  const name = text(value, "Ekip adı", 3, 40);
  // Collapse repeated spaces so "A  Takımı" and "A Takımı" are the same crew.
  return name.replace(/\s+/g, " ");
}

export function parseCrewName(form: FormData) {
  return { name: normalizeCrewName(form.get("name")) };
}

/**
 * Alphabet for shareable invite codes.
 *
 * Digits and letters that look alike when read aloud or copied by hand
 * (0/O, 1/I/L, 5/S, 8/B, 2/Z) are left out on purpose: these codes travel through
 * chat messages, voice notes and screenshots.
 */
const INVITE_ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";
export const INVITE_CODE_LENGTH = 8;

/**
 * Generates a fresh random invite code.
 *
 * Uses crypto-grade randomness because the code is a bearer token: anyone holding
 * it can join the crew. Math.random is not acceptable here.
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index++) {
    code += INVITE_ALPHABET[bytes[index] % INVITE_ALPHABET.length];
  }
  return code;
}

/**
 * Normalises a user-supplied invite code for lookup.
 *
 * Codes are generated uppercase, but a shared link may have been lowercased by
 * a chat client, so matching is case-insensitive. Anything that is not 8
 * characters of the alphabet is rejected before it reaches the database.
 */
export function normalizeInviteCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (raw.length !== INVITE_CODE_LENGTH) throw new ValidationError("Davet kodu 8 karakter olmalıdır.");
  for (const character of raw) {
    if (!INVITE_ALPHABET.includes(character)) throw new ValidationError("Davet kodu geçersiz.");
  }
  return raw;
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