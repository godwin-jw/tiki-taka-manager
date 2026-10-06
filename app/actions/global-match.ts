"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGlobalMatch, deleteGlobalMatch, reportGlobalMatch } from "@/lib/match-service";
import { resolveActiveCrewId } from "@/lib/active-crew";
import { jsonField, text, ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

export async function saveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: string;
  try {
    // The scope never comes from the form: it is the active crew from the
    // cookie, re-validated against the caller's own memberships. Matches are
    // crew-only, so a missing/invalid workspace is a hard stop.
    const crewId = await resolveActiveCrewId(user.id);
    if (!crewId) throw new ValidationError("Maç kaydetmek için bir ekibe katılmalısın.");
    id = await createGlobalMatch(prisma, user.id, { requestId: form.get("requestId"), date: form.get("date"), lineup: jsonField(form, "lineup"), teamAName: form.get("teamAName"), teamBName: form.get("teamBName"), crewId });
  }
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