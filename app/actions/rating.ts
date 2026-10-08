"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveCrewContext } from "@/lib/active-crew";
import { castPeerVote } from "@/lib/rating-service";
import { ratingAttributes } from "@/lib/rating";
import { ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

/**
 * Casts a crew-mate's six-attribute stat ballot.
 *
 * The voter identity comes from the session, never from the form, and the crew
 * membership rule is re-checked inside the service transaction. The active crew
 * is resolved server-side too: a stale dialog or crafted form cannot choose a
 * different crew, even when the voter belongs to both.
 */
export async function submitPeerVote(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { activeCrewId } = await getActiveCrewContext(user.id);
    if (!activeCrewId || form.get("crewId") !== activeCrewId) {
      throw new ValidationError("Yalnızca aktif ekibindeki oyunculara oy verebilirsin.");
    }
    await castPeerVote(prisma, user.id, activeCrewId, form.get("targetUserId"), Object.fromEntries(ratingAttributes.map(attr => [attr.key, form.get(attr.key)])));
  } catch (error) {
    return { error: error instanceof ValidationError ? error.message : "Oyun kaydedilemedi. Lütfen tekrar deneyin." };
  }
  // Votes are crew-scoped and never touch the global roster or the layout, so
  // only the pages that display a crew OVR are refreshed.
  revalidatePath("/");
  revalidatePath("/ekip/[id]", "page");
  revalidatePath("/oyuncu/[id]", "page");
  revalidatePath("/profil/[id]", "page");
  revalidatePath("/profil");
  return { success: "Değerlendirmen kaydedildi. Ekibin OVR ortalaması güncellendi." };
}