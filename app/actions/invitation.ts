"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  InvitationError,
  acceptInvitation,
  inviteUserToCrew,
  rejectInvitation,
  searchInvitableUsers,
} from "@/lib/invitation-service";
import { canManageCrew } from "@/lib/football";
import { ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

function failure(error: unknown): ActionState {
  if (error instanceof ValidationError || error instanceof InvitationError) return { error: error.message };
  return { error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
}

/**
 * Searches platform users to invite.
 *
 * Re-checks manager permission before querying: the dialog is only shown to
 * captains, but the action is reachable directly. The crew id comes from the
 * caller's own membership, never from the form.
 */
export async function searchUsersToInvite(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = String(form.get("crewId") ?? "");
    const query = String(form.get("query") ?? "");
    const membership = await prisma.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: user.id } }, select: { role: true } });
    // One rule for every officer tier: OWNER, CAPTAIN and CO_CAPTAIN may invite.
    if (!canManageCrew(membership?.role)) return { error: "Yalnızca ekip kaptanı davet gönderebilir." };
    const results = await searchInvitableUsers(prisma, crewId, user.id, query);
    return { results: results.map(entry => ({
      id: entry.id,
      name: entry.name ?? "Oyuncu",
      image: entry.image,
      ovrRating: entry.playerProfile ? Math.round(entry.playerProfile.ovrRating) : null,
      position: entry.playerProfile?.position ?? null,
      alreadyInvited: entry.receivedInvitations.length > 0,
    })) };
  } catch (error) {
    return failure(error);
  }
}

/** Sends a direct invitation. */
export async function sendCrewInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = String(form.get("crewId") ?? "");
    await inviteUserToCrew(prisma, user.id, crewId, form.get("receiverId"));
  } catch (error) {
    return failure(error);
  }
  // No revalidatePath here on purpose: the dialog's success message has to survive,
  // and nothing on the page changes until the invitee accepts.
  return { success: "Davet gönderildi. Oyuncu kabul ettiğinde ekibe katılacak." };
}

/**
 * Accepts an invitation and lands the user on the crew page.
 *
 * Redirects on success so a refresh cannot re-submit, which matters because
 * acceptance is what actually writes the membership.
 */
export async function acceptCrewInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let crewId: string;
  try {
    crewId = String(form.get("crewId") ?? "");
    const invitationId = String(form.get("invitationId") ?? "");
    const result = await acceptInvitation(prisma, user.id, invitationId);
    crewId = result.crewId;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  redirect(`/ekip/${crewId}?katildi=1`);
}

export async function rejectCrewInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await rejectInvitation(prisma, user.id, String(form.get("invitationId") ?? ""));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Davet reddedildi." };
}
