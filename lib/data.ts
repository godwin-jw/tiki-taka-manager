import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { ROSTER_MAX_AGE_SECONDS, ROSTER_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { matchResult, type RosterPlayer } from "@/lib/football";
import { DEFAULT_CREW_OVR, getCrewOvr } from "@/lib/crew-ovr";

// One request-scoped session shared with requireUser (see lib/auth.ts).
export { getSession };

/**
 * The global roster query itself. It does not depend on who is asking, only on
 * the caller having been authenticated, so the layout can start it in parallel
 * with the session lookup instead of waiting for it.
 */
const fetchRoster = async (): Promise<RosterPlayer[]> => {
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true, name: true, image: true,
      playerProfile: { select: {
        id: true, position: true, ovrRating: true,
        appearances: {
          where: { match: { status: "COMPLETED" } },
          orderBy: [{ match: { date: "desc" } }, { matchId: "desc" }], take: 5,
          select: { team: true, match: { select: { teamAScore: true, teamBScore: true } } },
        },
      } },
    },
  });
  return users.map(user => ({
    id: user.playerProfile?.id ?? "", userId: user.id, name: user.name || "Oyuncu",
    image: user.image, position: user.playerProfile?.position ?? "MID", ovrRating: user.playerProfile?.ovrRating ?? 0,
    form: user.playerProfile?.appearances.map(p => matchResult(p.team, p.match.teamAScore, p.match.teamBScore)) ?? [],
  }));
};

/**
 * Cross-request cache: this query costs ~4 sequential round trips and returned
 * the same rows to everybody on every page view. Profile and match actions call
 * `updateTag(ROSTER_TAG)`, so a change shows up on the very next render.
 */
const loadRoster = unstable_cache(fetchRoster, ["global-roster"], {
  tags: [ROSTER_TAG],
  revalidate: ROSTER_MAX_AGE_SECONDS,
});

// Explicit public fields only: phone, email and OAuth credentials never enter the roster DTO.
// The roster is only ever returned to a signed-in viewer. A request without a
// session cookie is a guest for certain, so it never reaches the database; with a
// cookie, the query runs concurrently with the real session check (which decides
// whether the rows are released), saving one round trip on every page load.
const SESSION_COOKIES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export const getRoster = cache(async (): Promise<RosterPlayer[]> => {
  const jar = await cookies();
  if (!SESSION_COOKIES.some(name => jar.has(name))) return [];
  const [session, players] = await Promise.all([getSession(), loadRoster()]);
  return session ? players : [];
});

/**
 * Roster of one crew, for a match that belongs to that crew.
 *
 * This is the crew isolation boundary for match building: a captain picking a
 * lineup for their crew may only see players who are in that crew, and the OVR
 * shown is the crew's own verdict (getCrewOvr), not a platform-wide number. A
 * global match (no crewId) keeps using getRoster.
 *
 * The crewId is validated against the caller's own membership, so a crafted
 * crewId cannot be used to read a roster the captain is not part of.
 */
export const getCrewRoster = cache(async (crewId: string): Promise<RosterPlayer[]> => {
  const session = await getSession();
  if (!session?.user?.id) return [];
  // Authorisation decides the result: you cannot scout a crew you are not in.
  // The membership check and the member list are independent reads, so they share
  // one round trip; for a non-member the rows are simply never returned.
  const [membership, members] = await Promise.all([
    prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId: session.user.id } },
      select: { id: true },
    }),
    prisma.crewMember.findMany({
      where: { crewId },
      orderBy: [{ joinedAt: "asc" }],
      select: {
        user: {
          select: {
            id: true, name: true, image: true,
            playerProfile: {
              select: {
                id: true, position: true,
                appearances: {
                  where: { match: { status: "COMPLETED" } },
                  orderBy: [{ match: { date: "desc" } }, { matchId: "desc" }], take: 5,
                  select: { team: true, match: { select: { teamAScore: true, teamBScore: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  if (!membership) return [];

  // Contextual OVR: this crew's votes for these members, and nothing else.
  const ovrByUser = await getCrewOvr(prisma, crewId, members.map(m => m.user.id));

  return members.flatMap(member => {
    const profile = member.user.playerProfile;
    if (!profile) return [];
    const crewOvr = ovrByUser.get(member.user.id);
    return [{
      id: profile.id,
      userId: member.user.id,
      name: member.user.name || "Oyuncu",
      image: member.user.image,
      position: profile.position,
      // Unrated in this crew: fall back to the neutral seed and say so.
      ovrRating: crewOvr?.ovrRating ?? DEFAULT_CREW_OVR,
      isUnrated: crewOvr?.isUnrated ?? true,
      form: profile.appearances.map(p => matchResult(p.team, p.match.teamAScore, p.match.teamBScore)),
    }];
  });
});