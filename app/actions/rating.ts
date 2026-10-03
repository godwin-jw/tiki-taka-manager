"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ratePlayer } from "@/lib/rating-service";
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