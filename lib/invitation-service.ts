// No `server-only` marker, matching lib/crew-standings.ts and lib/rating-service.ts:
// it would abort under the plain Node test runner. Access stays server-side because
// this module takes a PrismaClient as its first argument and is imported only by
// Server Actions and Server Components.

import type { PrismaClient } from "@prisma/client";
// Relative imports so the Node test runner can load this module without a bundler
// alias, matching lib/crew-standings.ts and lib/rating-service.ts.
import { CREW_MEMBER_LIMIT, canManageCrew } from "./football.ts";
import { generateInviteCode, normalizeInviteCode } from "./validation.ts";

export class InvitationError extends Error {}

/** The transactional client Prisma hands to a `$transaction` callback. */
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Finds a crew by its shareable code.
 *
 * The code is a bearer token, so an unknown code must not reveal whether a crew
 * exists: the caller gets null either way.
 */
export async function getCrewByInviteCode(db: PrismaClient, code: string) {
  const inviteCode = normalizeInviteCode(code);
  return db.crew.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, logo: true, _count: { select: { members: true } } },
  });
}

/**
 * Ensures a crew has an invite code, generating one if it predates the feature.
 *
 * A repair path rather than a migration-only concern, so a crew created by an
 * older deploy keeps working without a separate data patch.
 */
export async function ensureInviteCode(db: PrismaClient, crewId: string) {
  const existing = await db.crew.findUnique({ where: { id: crewId }, select: { inviteCode: true } });
  if (existing?.inviteCode) return existing.inviteCode;
  // Retry on the astronomically rare collision rather than failing the request.
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode();
    const updated = await db.crew.updateMany({ where: { id: crewId, inviteCode: null }, data: { inviteCode } });
    if (updated.count === 1) return inviteCode;
    const current = await db.crew.findUnique({ where: { id: crewId }, select: { inviteCode: true } });
    if (current?.inviteCode) return current.inviteCode;
  }
  throw new InvitationError("Davet kodu üretilemedi. Lütfen tekrar deneyin.");
}

/**
 * Searches platform users a captain can invite.
 *
 * Self and current crew members are filtered out in the query rather than in the
 * component, so a crafted request cannot enumerate the roster. Email matches are
 * exact so the search cannot be used to discover registered addresses, and the
 * result set is hard-capped to keep this from becoming a user-table dump.
 */
export async function searchInvitableUsers(db: PrismaClient, crewId: string, requesterId: string, query: string) {
  const search = query.trim();
  if (search.length < 2) return [];
  const crew = await db.crew.findUnique({ where: { id: crewId }, select: { members: { select: { userId: true } } } });
  if (!crew) throw new InvitationError("Ekip bulunamadı.");
  return db.user.findMany({
    where: {
      id: { notIn: [requesterId, ...crew.members.map((member) => member.userId)] },
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { equals: search, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      image: true,
      playerProfile: { select: { position: true, ovrRating: true } },
      // Lets the UI disable an entry that is already invited.
      receivedInvitations: { where: { crewId, status: "PENDING" }, select: { id: true } },
    },
    orderBy: { name: "asc" },
    take: 8,
  });
}

/**
 * Sends a direct invitation from a captain to a platform user.
 *
 * Guards, all re-checked inside the transaction so a stale client cannot invite
 * into a crew the sender no longer manages:
 *  - the sender must be an OWNER or CAPTAIN of this crew;
 *  - the receiver must exist and must not already be a member;
 *  - the crew must not be full.
 *
 * Re-inviting refreshes the existing row, so the inbox never stacks duplicates.
 */
export async function inviteUserToCrew(db: PrismaClient, senderId: string, crewId: string, receiverId: unknown) {
  const receiver = typeof receiverId === "string" ? receiverId.trim() : "";
  if (!receiver) throw new InvitationError("Oyuncu seçilmedi.");
  return db.$transaction(async (tx) => {
    await assertManager(tx, crewId, senderId);
    const crew = await tx.crew.findUnique({ where: { id: crewId }, select: { _count: { select: { members: true } } } });
    if (!crew) throw new InvitationError("Ekip bulunamadı.");
    if (crew._count.members >= CREW_MEMBER_LIMIT) throw new InvitationError(`Ekip dolu (en fazla ${CREW_MEMBER_LIMIT} üye).`);
    if (receiver === senderId) throw new InvitationError("Kendini davet edemezsin.");
    if (!await tx.user.findUnique({ where: { id: receiver }, select: { id: true } })) throw new InvitationError("Oyuncu bulunamadı.");
    if (await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId: receiver } }, select: { id: true } })) {
      throw new InvitationError("Bu oyuncu zaten ekibin üyesi.");
    }
    return tx.crewInvitation.upsert({
      where: { crewId_receiverId: { crewId, receiverId: receiver } },
      create: { crewId, senderId, receiverId: receiver, status: "PENDING" },
      update: { senderId, status: "PENDING", resolvedAt: null },
      select: { id: true, status: true },
    });
  });
}

/** Pending invitations addressed to the signed-in user. */
export async function listIncomingInvitations(db: PrismaClient, userId: string) {
  return db.crewInvitation.findMany({
    where: { receiverId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      crew: { select: { id: true, name: true, logo: true, _count: { select: { members: true } } } },
      sender: { select: { id: true, name: true, image: true } },
    },
  });
}

/** Invitations this user sent that are still waiting for an answer. */
export async function listOutgoingInvitations(db: PrismaClient, userId: string, crewId: string) {
  return db.crewInvitation.findMany({
    where: { crewId, senderId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, receiver: { select: { id: true, name: true, image: true } } },
  });
}

/**
 * Accepts an invitation and joins the crew atomically.
 *
 * The receiver identity comes from the session, so an invitation can only ever
 * be accepted by the person it was sent to. Membership is created only when
 * missing, so a double click or a retry after a redirect is harmless instead of
 * failing on the unique key.
 */
export async function acceptInvitation(db: PrismaClient, userId: string, invitationId: string) {
  return db.$transaction(async (tx) => {
    const invitation = await tx.crewInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, status: true, crewId: true, receiverId: true },
    });
    if (!invitation) throw new InvitationError("Davet bulunamadı.");
    // Ownership of the invitation is the real guard, not just the UI.
    if (invitation.receiverId !== userId) throw new InvitationError("Bu davet sana ait değil.");
    if (invitation.status !== "PENDING") throw new InvitationError("Bu davet zaten sonuçlanmış.");
    const crew = await tx.crew.findUnique({ where: { id: invitation.crewId }, select: { id: true, name: true, _count: { select: { members: true } } } });
    if (!crew) throw new InvitationError("Ekip bulunamadı.");
    if (crew._count.members >= CREW_MEMBER_LIMIT) throw new InvitationError("Ekip dolu.");
    if (!await tx.crewMember.findUnique({ where: { crewId_userId: { crewId: crew.id, userId } }, select: { id: true } })) {
      await tx.crewMember.create({ data: { crewId: crew.id, userId, role: "MEMBER" } });
    }
    await tx.crewInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
    // A pending join request for the same crew is now redundant.
    await tx.crewRequest.deleteMany({ where: { crewId: crew.id, userId, status: "PENDING" } });
    return { crewId: crew.id, crewName: crew.name };
  });
}

export async function rejectInvitation(db: PrismaClient, userId: string, invitationId: string) {
  return db.$transaction(async (tx) => {
    const invitation = await tx.crewInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, status: true, receiverId: true },
    });
    if (!invitation) throw new InvitationError("Davet bulunamadı.");
    if (invitation.receiverId !== userId) throw new InvitationError("Bu davet sana ait değil.");
    if (invitation.status !== "PENDING") throw new InvitationError("Bu davet zaten sonuçlanmış.");
    await tx.crewInvitation.update({ where: { id: invitation.id }, data: { status: "REJECTED", resolvedAt: new Date() } });
    return { id: invitation.id };
  });
}

/**
 * Joins a crew through a shareable invite link.
 *
 * This is the onboarding path a stranger lands on, so every assumption is
 * verified here: the code must exist, the crew must not be full, and the user
 * must not already be a member. Membership and the invitation bookkeeping commit
 * together, so an interrupted request can never leave a half-joined state.
 *
 * Returns an outcome instead of throwing because the caller renders a distinct
 * message for each case (invalid link, already a member, crew full).
 */
export async function joinCrewByInviteCode(db: PrismaClient, userId: string, rawCode: string) {
  const inviteCode = normalizeInviteCode(rawCode);
  return db.$transaction(async (tx) => {
    const crew = await tx.crew.findUnique({
      where: { inviteCode },
      select: { id: true, name: true, _count: { select: { members: true } } },
    });
    if (!crew) return { outcome: "invalid" as const };
    const membership = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId: crew.id, userId } }, select: { id: true } });
    // Already in: a success for the caller, who lands on the crew page anyway.
    if (membership) return { outcome: "already" as const, crewId: crew.id, crewName: crew.name };
    if (crew._count.members >= CREW_MEMBER_LIMIT) return { outcome: "full" as const, crewName: crew.name };
    await tx.crewMember.create({ data: { crewId: crew.id, userId, role: "MEMBER" } });
    // A pending invitation for this crew is settled by the join itself.
    await tx.crewInvitation.updateMany({
      where: { crewId: crew.id, receiverId: userId, status: "PENDING" },
      data: { status: "ACCEPTED", resolvedAt: new Date() },
    });
    await tx.crewRequest.deleteMany({ where: { crewId: crew.id, userId, status: "PENDING" } });
    return { outcome: "joined" as const, crewId: crew.id, crewName: crew.name };
  });
}

async function assertManager(tx: Tx, crewId: string, userId: string) {
  const membership = await tx.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } }, select: { role: true } });
  if (!canManageCrew(membership?.role)) throw new InvitationError("Yalnızca ekip kaptanı davet gönderebilir.");
}

