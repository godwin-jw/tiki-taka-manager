import "server-only";

import { prisma } from "@/lib/prisma";
import { getCrewSeasonLeaders } from "@/lib/crew-leaders";
import { CREW_MEMBER_LIMIT, canManageCrew, type CrewRoleName } from "@/lib/football";
import { generateInviteCode } from "@/lib/validation";
import { ensureInviteCode } from "@/lib/invitation-service";
import { DEFAULT_CREW_OVR, getCrewOvr } from "@/lib/crew-ovr";

export class CrewError extends Error {}

/** Shape used by the crew card grid on /ekipler. */
export async function listCrews(query?: string) {
  const search = query?.trim() ?? "";
  const crews = await prisma.crew.findMany({
    // Case-insensitive contains search; most members first, then alphabetical.
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: [{ members: { _count: "desc" } }, { name: "asc" }],
    take: 60,
    select: {
      id: true,
      name: true,
      logo: true,
      createdAt: true,
      owner: { select: { id: true, name: true, image: true } },
      _count: { select: { members: true, requests: { where: { status: "PENDING" } } } },
    },
  });
  return crews.map((crew) => ({
    id: crew.id,
    name: crew.name,
    logo: crew.logo,
    ownerName: crew.owner.name ?? "Bilinmiyor",
    ownerImage: crew.owner.image,
    memberCount: crew._count.members,
    pendingCount: crew._count.requests,
  }));
}

/** The viewer's membership in a crew, or null when they are not a member. */
export async function getViewerMembership(crewId: string, userId: string) {
  return prisma.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } }, select: { role: true, joinedAt: true } });
}

export async function getCrewsOfUser(userId: string) {
  return prisma.crew.findMany({
    where: { members: { some: { userId } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, logo: true, _count: { select: { members: true } } },
  });
}

export async function getCrewDetail(crewId: string, viewerId: string) {
  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    select: {
      id: true,
      name: true,
      logo: true,
      createdAt: true,
      inviteCode: true,
      owner: { select: { id: true, name: true, image: true } },
      members: {
        orderBy: [{ joinedAt: "asc" }],
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              playerProfile: { select: { position: true, ovrRating: true, goals: true, assists: true, matchesPlayed: true, motmCount: true } },
            },
          },
        },
      },
      _count: { select: { members: true } },
    },
  });
  if (!crew) return null;

  // Only members see the roster and the crew leaderboards.
  const membership = await getViewerMembership(crewId, viewerId);
  const isMember = membership !== null;
  const isManager = canManageCrew(membership?.role);

  const pendingRequests = isManager
    ? await prisma.crewRequest.findMany({
        where: { crewId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, name: true, image: true, playerProfile: { select: { ovrRating: true, position: true } } } },
        },
      })
    : [];

  const viewerRequest = await prisma.crewRequest.findUnique({
    where: { crewId_userId: { crewId, userId: viewerId } },
    select: { status: true },
  });

  // Crew-scoped season totals for the leaderboards. The career counters on
  // PlayerProfile are platform-wide (they include other crews and global matches),
  // so they must NOT be used here: that would leak outside scorers into this crew.
  const activeSeason = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true } });
  const standings = activeSeason ? await getCrewSeasonLeaders(prisma, crewId, activeSeason.id) : null;
  const statByUser = new Map((standings?.rows ?? []).map(row => [row.userId, row]));
  // The viewer's own vote per member, so the dialog can reopen on the stored value.
  const viewerVotes = isMember
    ? await prisma.playerRatingVote.findMany({
        where: { crewId, voterId: viewerId },
        select: { targetUserId: true, ovrRating: true },
      })
    : [];
  // Contextual OVR for the roster: this crew's verdict only, so a player shared
  // with a stronger side is not shown the other crew's number here.
  const crewOvr = await getCrewOvr(prisma, crewId, crew.members.map(m => m.user.id));
  const voteByUser = new Map(viewerVotes.map(vote => [vote.targetUserId, vote.ovrRating]));

  const roster = crew.members.map((member) => {
    const scoped = statByUser.get(member.user.id);
    const contextual = crewOvr.get(member.user.id);
    return {
      memberId: member.id,
      role: member.role as CrewRoleName,
      userId: member.user.id,
      name: member.user.name ?? "Oyuncu",
      image: member.user.image,
      position: member.user.playerProfile?.position ?? ("MID" as const),
      // Unrated in this crew: neutral seed plus an explicit flag, never another
      // crew's rating and never a misleading 0.
      ovrRating: contextual?.ovrRating ?? DEFAULT_CREW_OVR,
      isUnrated: contextual?.isUnrated ?? true,
      voteCount: contextual?.voteCount ?? 0,
      // Career numbers are deliberately crew-scoped when a season exists.
      goals: scoped?.goals ?? 0,
      assists: scoped?.assists ?? 0,
      matchesPlayed: scoped?.matchesPlayed ?? 0,
      motmCount: scoped?.motmCount ?? 0,
      hasProfile: member.user.playerProfile !== null,
      viewerVote: voteByUser.get(member.user.id) ?? null,
    };
  });

  return {
    id: crew.id,
    name: crew.name,
    logo: crew.logo,
    createdAt: crew.createdAt,
    // A crew created before the invite feature is repaired on read, so the share
    // link never renders as empty.
    inviteCode: await ensureInviteCode(prisma, crew.id),
    ownerName: crew.owner.name ?? "Bilinmiyor",
    ownerId: crew.owner.id,
    memberCount: crew._count.members,
    isMember,
    isManager,
    isOwner: membership?.role === "OWNER",
    membershipRole: (membership?.role ?? null) as CrewRoleName | null,
    viewerRequestStatus: viewerRequest?.status ?? null,
    roster: isMember ? roster : [],
    pendingRequests,
    memberLimit: CREW_MEMBER_LIMIT,
  };
}

/**
 * Every write re-checks the permission inside the transaction so a stale client
 * can never approve a request it is no longer allowed to approve.
 */
export async function createCrew(userId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.crew.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (duplicate) throw new CrewError("Bu isimde bir ekip zaten var.");
    // The owner is seeded as an OWNER member so listing and "my crews" queries
    // never depend on a second code path. The invite code is minted here so a
    // crew is never created without a shareable link.
    return tx.crew.create({ data: { name, ownerId: userId, inviteCode: generateInviteCode(), members: { create: { userId, role: "OWNER" } } }, select: { id: true, name: true, inviteCode: true } });
  });
}

export async function requestToJoin(userId: string, crewId: string, message: string | null) {
  return prisma.$transaction(async (tx) => {
    const crew = await tx.crew.findUnique({ where: { id: crewId }, select: { ownerId: true, _count: { select: { members: true } } } });
    if (!crew) throw new CrewError("Ekip bulunamadı.");
    if (crew.ownerId === userId) throw new CrewError("Kendi ekibine katılma isteği gönderemezsin.");
    const membership = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } }, select: { id: true } });
    if (membership) throw new CrewError("Zaten bu ekibin üyesisin.");
    if (crew._count.members >= CREW_MEMBER_LIMIT) throw new CrewError(`Ekip dolu (en fazla ${CREW_MEMBER_LIMIT} üye).`);
    // One row per crew and user: re-requesting refreshes the existing request.
    return tx.crewRequest.upsert({
      where: { crewId_userId: { crewId, userId } },
      create: { crewId, userId, message, status: "PENDING" },
      update: { message, status: "PENDING", resolvedAt: null, reviewedById: null },
      select: { id: true, status: true },
    });
  });
}

export async function cancelCrewRequest(userId: string, crewId: string) {
  const result = await prisma.crewRequest.deleteMany({ where: { crewId, userId, status: "PENDING" } });
  if (result.count === 0) throw new CrewError("Bekleyen isteğin bulunamadı.");
}

async function assertManager(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], crewId: string, userId: string) {
  const membership = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } }, select: { role: true } });
  if (!canManageCrew(membership?.role)) throw new CrewError("Yalnızca ekip kaptanı istekleri yönetebilir.");
}

/** Approves a request and adds the player as a MEMBER atomically. */
export async function approveCrewRequest(userId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.crewRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, crewId: true, userId: true } });
    if (!request) throw new CrewError("İstek bulunamadı.");
    if (request.status !== "PENDING") throw new CrewError("Bu istek zaten sonuçlanmış.");
    await assertManager(tx, request.crewId, userId);

    const count = await tx.crewMember.count({ where: { crewId: request.crewId } });
    if (count >= CREW_MEMBER_LIMIT) throw new CrewError("Ekip dolu.");

    await tx.crewMember.upsert({
      where: { crewId_userId: { crewId: request.crewId, userId: request.userId } },
      create: { crewId: request.crewId, userId: request.userId, role: "MEMBER" },
      update: {},
    });
    return tx.crewRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED", reviewedById: userId, resolvedAt: new Date() }, select: { id: true } });
  });
}

export async function rejectCrewRequest(userId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.crewRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, crewId: true } });
    if (!request) throw new CrewError("İstek bulunamadı.");
    if (request.status !== "PENDING") throw new CrewError("Bu istek zaten sonuçlanmış.");
    await assertManager(tx, request.crewId, userId);
    return tx.crewRequest.update({ where: { id: request.id }, data: { status: "REJECTED", reviewedById: userId, resolvedAt: new Date() }, select: { id: true } });
  });
}

/**
 * Grants or revokes the CO_CAPTAIN ("kaptan yardımcısı") role.
 *
 * Deliberately narrow, mirroring kickCrewMember's rules:
 *  - only the crew's OWNER may change roles; captains (and co-captains) cannot
 *    promote anybody, because the role is an officer rank, not a roster tool;
 *  - nobody may change their own role (the OWNER check already excludes them,
 *    but the explicit guard keeps the intent obvious);
 *  - only the MEMBER <-> CO_CAPTAIN transition is allowed. CAPTAIN and OWNER
 *    are never demoted through this path, so a crew always keeps someone in
 *    charge and the owner can never lock themselves out;
 *  - the target must actually be a member of this crew.
 */
export async function setCrewMemberRole(actorId: string, crewId: string, targetUserId: string, role: "MEMBER" | "CO_CAPTAIN") {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: actorId } }, select: { role: true } });
    if (actor?.role !== "OWNER") throw new CrewError("Yalnızca kurucu kaptan yardımcısı atayabilir.");
    if (actorId === targetUserId) throw new CrewError("Kendi rolünü değiştiremezsin.");

    const target = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: targetUserId } }, select: { id: true, role: true } });
    if (!target) throw new CrewError("Bu oyuncu bu ekibin üyesi değil.");
    if (target.role !== "MEMBER" && target.role !== "CO_CAPTAIN") throw new CrewError("Bu üyenin rolü değiştirilemez.");
    if (target.role === role) throw new CrewError(role === "CO_CAPTAIN" ? "Bu oyuncu zaten kaptan yardımcısı." : "Bu oyuncu zaten kaptan yardımcısı değil.");

    await tx.crewMember.update({ where: { id: target.id }, data: { role } });
    return { crewId, userId: targetUserId, role };
  });
}

export async function leaveCrew(userId: string, crewId: string) {
  const membership = await prisma.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } }, select: { id: true, role: true } });
  if (!membership) throw new CrewError("Bu ekibin üyesi değilsin.");
  if (membership.role === "OWNER") throw new CrewError("Ekip sahibi ekibten ayrılamaz.");
  await prisma.crewMember.delete({ where: { id: membership.id } });
}

// Re-exported so callers (and the action layer) keep a single import site for the
// crew domain; the implementation lives in its own module so the test suite can
// exercise it with an injected Prisma client.
export { kickCrewMember } from "@/lib/crew-kick";
