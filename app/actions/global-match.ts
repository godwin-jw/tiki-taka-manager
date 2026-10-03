"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGlobalMatch, reportGlobalMatch } from "@/lib/match-service";
import { jsonField, text, ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

export async function saveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: string;
  try { id = await createGlobalMatch(prisma, user.id, { requestId: form.get("requestId"), date: form.get("date"), lineup: jsonField(form, "lineup") }); }
  catch (error) { return { error: error instanceof ValidationError ? error.message : "Maç kaydedilemedi. Lütfen tekrar deneyin." }; }
  revalidatePath("/", "layout");
  redirect(`/mac/${id}`);
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