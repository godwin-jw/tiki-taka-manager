"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CREW_COOKIE } from "@/lib/active-crew";

/**
 * Switches the viewer's workspace to one of their own crews.
 *
 * The crew id is re-checked against the session user's memberships before it
 * touches the cookie, so a hand-crafted call can never point the workspace at a
 * crew the caller does not belong to. The cookie write itself refreshes every
 * page that reads the workspace (dashboard tabs, match builder, switcher).
 */
export async function setActiveCrew(crewId: string): Promise<void> {
  const user = await requireUser();
  const id = typeof crewId === "string" ? crewId.trim() : "";
  if (!id) return;
  const membership = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId: id, userId: user.id } },
    select: { id: true },
  });
  if (!membership) return;

  const store = await cookies();
  store.set(ACTIVE_CREW_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    // The workspace survives between visits; membership is re-validated on read.
    maxAge: 60 * 60 * 24 * 365,
  });
  // No revalidatePath: writing a cookie in a Server Action already invalidates
  // the client Router Cache and makes Next re-render the current route in the
  // same response, with the new cookie visible to that render. An explicit
  // layout-wide revalidation only added a second, identical pass.
}