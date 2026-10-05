"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGlobalMatch, deleteGlobalMatch, reportGlobalMatch } from "@/lib/match-service";
import { getCrewRoster } from "@/lib/data";

/**
 * Returns the crew-only player pool for the match builder.
 *
 * Picking a crew narrows the pool to that crew's members; leaving it empty keeps
 * the global pool. The crew id is not trusted here beyond the lookup: getCrewRoster
 * re-checks that the caller is a member, so a crafted crewId returns an empty list
 * instead of another crew's roster. createGlobalMatch enforces the same rule again
 * on save, so this action is a convenience layer, not the security boundary.
 */
export async function loadCrewPool(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  try {
    const crewId = String(form.get("crewId") ?? "").trim();
    if (!crewId) return { results: [] };
    return { results: await getCrewRoster(crewId) };
  } catch {
    return { error: "Ekip oyuncu havuzu yüklenemedi." };
  }
}
import { jsonField, text, ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

export async function saveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: string;
  try { id = await createGlobalMatch(prisma, user.id, { requestId: form.get("requestId"), date: form.get("date"), lineup: jsonField(form, "lineup"), teamAName: form.get("teamAName"), teamBName: form.get("teamBName"), crewId: form.get("crewId") }); }
  catch (error) { return { error: error instanceof ValidationError ? error.message : "Maç kaydedilemedi. Lütfen tekrar deneyin." }; }
  revalidatePath("/", "layout");
  redirect(`/mac/${id}`);
}

/**
 * Removes a match from the archive.
 *
 * Ownership is re-checked inside the service transaction; the button visibility
 * in the UI is only a convenience and never the guard.
 */
export async function removeMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const id = text(form.get("matchId"), "Maç", 1, 100);
    // The checkbox makes the irreversible step explicit and blocks stray submits.
    if (form.get("confirm") !== "on") throw new ValidationError("Silme işlemini onayladığını belirtmelisin.");
    await deleteGlobalMatch(prisma, user.id, id);
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "Maç silinemedi. Lütfen tekrar deneyin." }; }
  revalidatePath("/", "layout");
  return { success: "Maç arşivden kaldırıldı ve o maçtan doğan istatistikler geri alındı." };
}

export async function submitMatchReport(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: string;
  try {
    if (form.get("confirm") !== "on") throw new ValidationError("Raporu onayladığını belirtmelisin.");
    id = text(form.get("matchId"), "Maç", 1, 100);
    await reportGlobalMatch(prisma, user.id, id, jsonField(form, "report"));
  } catch (error) { return { error: error instanceof ValidationError ? error.message : "Rapor kaydedilemedi. İstatistikler değiştirilmedi; tekrar deneyin." }; }
  revalidatePath("/", "layout");
  redirect(`/mac/${id}`);
}