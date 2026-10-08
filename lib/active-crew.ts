import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { CrewRoleName } from "@/lib/football";

/**
 * The workspace cookie behind "aktif ekip".
 *
 * Every crew-scoped surface (dashboard tabs, match creation, the switcher in
 * the header) reads the SAME resolved crew id from this cookie, so the app has
 * one notion of "which crew am I working in" instead of a param per page.
 * The cookie is HTTP-only and written only by server code; the value is always
 * re-validated against the viewer's own memberships, never trusted as-is.
 */
export const ACTIVE_CREW_COOKIE = "activeCrewId";

export type ActiveCrewSummary = { id: string; name: string; role: CrewRoleName };

export type ActiveCrewContext = {
  /**
   * Validated active crew id: the cookie value when it still points at a crew
   * the viewer is a member of, otherwise the earliest membership (the fallback
   * that seeds the workspace for the first visit). Null when in no crew.
   */
  activeCrewId: string | null;
  /** Every crew the viewer belongs to, oldest membership first. */
  crews: ActiveCrewSummary[];
  /**
   * False when the cookie was missing or pointed at a foreign/stale crew and
   * the fallback was used. The client then persists `activeCrewId` once via the
   * setActiveCrew server action (cookies cannot be written during render).
   */
  cookieValid: boolean;
};

/**
 * Resolves the viewer's active crew.
 *
 * Order: memberships by join date → validate the cookie against them → fall
 * back to the first membership. Both reads happen in one place so the layout,
 * the dashboard and the match page can never disagree about the workspace.
 *
 * Wrapped in `cache`: the layout and the page both ask for it in the same
 * request and now share one membership query. Outside a render (Server Actions)
 * `cache` does not memoise, so a membership change is always read fresh there.
 */
export const getActiveCrewContext = cache(async (userId: string): Promise<ActiveCrewContext> => {
  // The cookie jar is a header read, not I/O, but awaiting it first would still
  // delay the membership query by a tick; both start together.
  const [memberships, jar] = await Promise.all([
    prisma.crewMember.findMany({
      where: { userId },
      // Deterministic fallback: the crew the user joined first is the default.
      orderBy: { joinedAt: "asc" },
      select: { role: true, crew: { select: { id: true, name: true } } },
    }),
    cookies(),
  ]);
  const crews = memberships.map((membership) => ({
    id: membership.crew.id,
    name: membership.crew.name,
    role: membership.role,
  }));
  if (crews.length === 0) return { activeCrewId: null, crews, cookieValid: true };

  const cookieValue = jar.get(ACTIVE_CREW_COOKIE)?.value ?? "";
  const cookieValid = crews.some((crew) => crew.id === cookieValue);
  return {
    activeCrewId: cookieValid ? cookieValue : crews[0].id,
    crews,
    cookieValid,
  };
});

/**
 * The crew id match creation must write, straight from the cookie.
 *
 * Server-side resolution on purpose: the form never chooses the scope, so a
 * crafted request cannot attach a match to another crew. The membership is
 * re-validated through getActiveCrewContext, so a stale cookie falls back to a
 * crew the user is actually in (or null when they are in none).
 */
export async function resolveActiveCrewId(userId: string): Promise<string | null> {
  const { activeCrewId } = await getActiveCrewContext(userId);
  return activeCrewId;
}