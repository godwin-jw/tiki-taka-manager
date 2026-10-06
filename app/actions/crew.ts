"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CrewError,
  approveCrewRequest,
  cancelCrewRequest,
  createCrew,
  kickCrewMember,
  leaveCrew,
  rejectCrewRequest,
  requestToJoin,
  setCrewMemberRole,
} from "@/lib/crew-service";
import { ValidationError, parseCrewName, parseCrewRequestMessage, text } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

/** Maps service and validation failures to user-facing Turkish messages. */
function failure(error: unknown): ActionState {
  if (error instanceof ValidationError || error instanceof CrewError) return { error: error.message };
  return { error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
}

function crewPath(crewId: string) {
  return `/ekip/${crewId}`;
}

export async function createCrewAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let crewId: string;
  try {
    const { name } = parseCrewName(form);
    const crew = await createCrew(user.id, name);
    crewId = crew.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/ekipler");
  redirect(crewPath(crewId));
}

export async function requestToJoinAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = text(form.get("crewId"), "Ekip", 1, 100);
    const message = parseCrewRequestMessage(form.get("message"));
    await requestToJoin(user.id, crewId, message);
    revalidatePath(crewPath(crewId));
    return { success: "Katılma istebin gönderildi. Kaptan onayladığında bildirim alacaksın." };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelCrewRequestAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = text(form.get("crewId"), "Ekip", 1, 100);
    await cancelCrewRequest(user.id, crewId);
    revalidatePath(crewPath(crewId));
    return { success: "İstek geri çekildi." };
  } catch (error) {
    return failure(error);
  }
}

export async function reviewCrewRequestAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const crewId = String(form.get("crewId") ?? "");
  try {
    const requestId = text(form.get("requestId"), "İstek", 1, 100);
    const decision = text(form.get("decision"), "Karar", 1, 20);
    if (decision === "ACCEPT") await approveCrewRequest(user.id, requestId);
    else if (decision === "REJECT") await rejectCrewRequest(user.id, requestId);
    else return { error: "Geçersiz işlem." };
    if (crewId) revalidatePath(crewPath(crewId));
    revalidatePath("/ekipler");
    return { success: decision === "ACCEPT" ? "Oyuncu ekibe katıldı." : "İstek reddedildi." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Removes a member from a crew.
 *
 * The crew id and the target both come from the form, but every rule is decided
 * by kickCrewMember against the session user, so a hand-crafted request cannot
 * remove somebody the actor has no authority over.
 */
export async function kickCrewMemberAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = text(form.get("crewId"), "Ekip", 1, 100);
    const targetUserId = text(form.get("userId"), "Oyuncu", 1, 100);
    await kickCrewMember(prisma, user.id, crewId, targetUserId);
    revalidatePath(crewPath(crewId));
    revalidatePath("/ekipler");
    return { success: "Oyuncu ekipten çıkarıldı." };
  } catch (error) {
    return failure(error);
  }
}

export async function leaveCrewAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = text(form.get("crewId"), "Ekip", 1, 100);
    await leaveCrew(user.id, crewId);
    revalidatePath(crewPath(crewId));
    revalidatePath("/ekipler");
    return { success: "Ekipten ayrıldın." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Grants or revokes the CO_CAPTAIN role on a member.
 *
 * The role value is restricted to the two allowed transitions before anything
 * reaches the service; setCrewMemberRole re-checks that the session user is the
 * crew's OWNER, so a hand-crafted request cannot promote anybody.
 */
export async function setCrewRoleAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const crewId = text(form.get("crewId"), "Ekip", 1, 100);
    const targetUserId = text(form.get("userId"), "Oyuncu", 1, 100);
    const role = text(form.get("role"), "Rol", 1, 20);
    if (role !== "MEMBER" && role !== "CO_CAPTAIN") throw new ValidationError("Geçersiz rol.");
    await setCrewMemberRole(user.id, crewId, targetUserId, role);
    revalidatePath(crewPath(crewId));
    return { success: role === "CO_CAPTAIN" ? "Oyuncu kaptan yardımcısı yapıldı." : "Kaptan yardımcılığı kaldırıldı." };
  } catch (error) {
    return failure(error);
  }
}