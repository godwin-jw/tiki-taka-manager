import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchResult, type RosterPlayer } from "@/lib/football";
import { DEFAULT_CREW_OVR, getCrewOvr } from "@/lib/crew-ovr";

export const getSession = cache(() => getServerSession(authOptions));

// Explicit public fields only: phone, email and OAuth credentials never enter the roster DTO.
export const getRoster = cache(async (): Promise<RosterPlayer[]> => {
  const session = await getSession();
  if (!session) return [];
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
  // Authorisation first: you cannot scout a crew you are not in.
  const membership = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId: session.user.id } },
    select: { id: true },
  });
  if (!membership) return [];

  const members = await prisma.crewMember.findMany({
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
  });

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