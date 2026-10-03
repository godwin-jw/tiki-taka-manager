import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchResult, type RosterPlayer } from "@/lib/football";

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