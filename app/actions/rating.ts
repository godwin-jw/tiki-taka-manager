"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { castPeerVote, ratePlayer } from "@/lib/rating-service";
import { ratingAttributes } from "@/lib/rating";
import { ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

export async function submitPlayerRating(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await ratePlayer(prisma, user.id, form.get("playerProfileId"), Object.fromEntries(ratingAttributes.map(attr => [attr.key, form.get(attr.key)])));
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "Değerlendirme kaydedilemedi. Lütfen tekrar deneyin." };
  }
  revalidatePath("/", "layout");
  return { success: "Değerlendirmen kaydedildi. Oyuncunun OVR ortalaması güncellendi." };
}

/**
 * Casts a crew-mate's OVR vote.
 *
 * The voter identity comes from the session, never from the form, and the crew
 * membership rule is re-checked inside the service transaction, so a hand-crafted
 * request cannot vote across crews.
 */
export async function submitPeerVote(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await castPeerVote(prisma, user.id, form.get("crewId"), form.get("targetUserId"), form.get("ovrRating"));
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "Oyun kaydedilemedi. Lütfen tekrar deneyin." };
  }
  revalidatePath("/", "layout");
  return { success: "Oyun kaydedildi. OVR ortalaması güncellendi." };
}