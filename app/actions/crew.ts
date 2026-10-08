"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROSTER_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CREW_COOKIE } from "@/lib/active-crew";
import {
  CrewError,
  approveCrewRequest,
  cancelCrewRequest,
  createCrew,
  deleteCrewByOwner,
  kickCrewMember,
  leaveCrew,
  rejectCrewRequest,
  renameCrewByOwner,
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

/**
 * Renames a crew. Only the crew's OWNER may do it.
 *
 * Called directly from a client component (not through a <form>), so the
 * arguments are untrusted: both are validated again in renameCrewByOwner, and
 * the ownership check runs there inside the transaction against the SESSION
 * user - never against anything the client sends.
 *
 * The layout is revalidated because the crew name is rendered all over it (the
 * workspace switcher in the header and the "Ekibim" menu in the sidebar).
 */
export async function renameCrew(crewId: string, newName: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const result = await renameCrewByOwner(prisma, user.id, crewId, newName);
    // Deliberately layout-wide: the name is part of the layout's crew list, so
    // this is one of the few writes that really invalidates the whole tree.
    revalidatePath("/", "layout");
    return { success: result.changed ? "Ekip adı güncellendi." : "Ekip adı zaten bu şekilde." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Permanently deletes a crew. Only the crew's OWNER may do it.
 *
 * `confirmName` is the name the user typed into the confirmation field. It is
 * compared on the server against the real name, so skipping the UI (a hand
 * crafted call) cannot skip the confirmation either.
 *
 * Active-crew cookie: when it points at the crew that was just deleted it is
 * removed, so the next request falls back to a crew the user still belongs to
 * (getActiveCrewContext re-validates the cookie against live memberships) or to
 * "no workspace" - never to a crew that no longer exists. A cookie that points
 * somewhere else is left alone. Other members' cookies need no cleanup: theirs
 * stop validating the moment the memberships are gone.
 *
 * `redirect` throws by design and therefore runs outside the try/catch.
 */
export async function deleteCrew(crewId: string, confirmName: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteCrewByOwner(prisma, user.id, crewId, confirmName);
  } catch (error) {
    return failure(error);
  }
  const store = await cookies();
  // The service trims the id, so compare the trimmed value the same way.
  if (store.get(ACTIVE_CREW_COOKIE)?.value === crewId.trim()) store.delete(ACTIVE_CREW_COOKIE);
  // The deletion rewinds the crew's match stats, which also changes the recent
  // form shown in the cached global roster.
  updateTag(ROSTER_TAG);
  // Deliberately layout-wide: the deleted crew disappears from the layout's crew
  // list and every page that was scoped to it.
  revalidatePath("/", "layout");
  redirect("/ekipler");
}
