import { Prisma, type PrismaClient } from "@prisma/client";
import { parseLineup, parseReport, text, ValidationError } from "./validation.ts";

// Not a Server Action: callers supply the authenticated server-side user ID.
export async function createGlobalMatch(db: PrismaClient, userId: string, input: { requestId: unknown; date: unknown; lineup: unknown }) {
  const id = text(input.requestId, "İşlem kimliği", 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ValidationError("Geçersiz işlem kimliği.");
  const dateText = text(input.date, "Maç tarihi", 10, 40);
  const date = new Date(dateText);
  if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() - 86_400_000 || date.getTime() > Date.now() + 365 * 86_400_000) throw new ValidationError("Maç tarihi son 24 saat ile gelecek bir yıl arasında olmalıdır.");
  const lineup = parseLineup(input.lineup);
  // New matches always count towards the live season.
  const activeSeasonId = await db.season.findFirst({ where: { isActive: true }, select: { id: true } }).then(row => row?.id ?? null);
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "CAPTAIN") throw new ValidationError("Maç oluşturmak için kaptan olmalısın.");
  const existing = await db.match.findUnique({ where: { id }, select: { createdById: true } });
  if (existing) {
    if (existing.createdById !== userId) throw new ValidationError("Geçersiz işlem kimliği.");
    return id;
  }
  const profiles = await db.playerProfile.findMany({ where: { id: { in: lineup.map(p => p.id) } }, select: { id: true, ovrRating: true } });
  if (profiles.length !== lineup.length) throw new ValidationError("Seçilen oyunculardan biri artık havuzda değil. Sayfayı yenile.");
  const ratings = new Map(profiles.map(p => [p.id, p.ovrRating]));
  try {
    await db.match.create({ data: {
      id, date, createdById: userId, status: "ONGOING", seasonId: activeSeasonId,
      players: { create: lineup.map(p => ({ playerProfileId: p.id, team: p.team, position: p.position, ovrAtMatch: ratings.get(p.id)! })) },
    } });
  } catch (error) {
    // A double click/network retry must not create a second match.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await db.match.findUnique({ where: { id }, select: { createdById: true } });
      if (retry?.createdById === userId) return id;
    }
    throw error;
  }
  return id;
}

export async function reportGlobalMatch(db: PrismaClient, userId: string, matchId: string, input: unknown) {
  const report = parseReport(input);
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== "CAPTAIN") throw new ValidationError("Raporlama için kaptan yetkisi gerekiyor.");
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { players: true } });
    if (!match || match.createdById !== userId || match.groupId !== null) throw new ValidationError("Bu maçı raporlama yetkin yok.");
    if (match.status !== "ONGOING" || match.reportedAt) throw new ValidationError("Bu maç zaten raporlanmış veya kapatılmış.");
    if (match.players.length !== report.players.length || report.players.some(p => !match.players.some(m => m.playerProfileId === p.id))) throw new ValidationError("Rapor yalnızca kayıtlı maç kadrosunu içerebilir.");
    for (const team of ["A", "B"] as const) {
      const ids = new Set(match.players.filter(p => p.team === team).map(p => p.playerProfileId));
      const stats = report.players.filter(p => ids.has(p.id));
      const score = team === "A" ? report.scoreA : report.scoreB;
      if (stats.reduce((n, p) => n + p.goals, 0) !== score) throw new ValidationError(`${team} takımının oyuncu golleri skorla eşleşmelidir.`);
      if (stats.reduce((n, p) => n + p.assists, 0) > score) throw new ValidationError(`${team} takımının asistleri gol sayısını aşamaz.`);
    }
    // Conditional row claim serializes competing requests before any counters change.
    // The status and every statistic commit together, or all roll back.
    const claimed = await tx.match.updateMany({ where: { id: matchId, createdById: userId, status: "ONGOING", reportedAt: null }, data: { status: "COMPLETED", isCompleted: true, reportedAt: new Date(), teamAScore: report.scoreA, teamBScore: report.scoreB } });
    if (claimed.count !== 1) throw new ValidationError("Bu rapor başka bir istekte onaylandı. Sayfayı yenile.");
    for (const row of report.players) {
      const isMotm = row.id === report.motmId;
      await tx.matchPlayer.update({ where: { matchId_playerProfileId: { matchId, playerProfileId: row.id } }, data: { goals: row.goals, assists: row.assists, isMotm } });
      const updated = await tx.playerProfile.update({ where: { id: row.id }, data: { goals: { increment: row.goals }, assists: { increment: row.assists }, matchesPlayed: { increment: 1 }, motmCount: { increment: isMotm ? 1 : 0 } }, select: { ovrRating: true } });
      // Mirror the same numbers onto the season line in this transaction, so a
      // rolled-back report can never leave career and season totals disagreeing.
      if (match.seasonId) {
        await tx.playerSeasonStat.upsert({
          where: { seasonId_playerProfileId: { seasonId: match.seasonId, playerProfileId: row.id } },
          create: { seasonId: match.seasonId, playerProfileId: row.id, goals: row.goals, assists: row.assists, matchesPlayed: 1, motmCount: isMotm ? 1 : 0, ovrRating: updated.ovrRating },
          update: { goals: { increment: row.goals }, assists: { increment: row.assists }, matchesPlayed: { increment: 1 }, motmCount: { increment: isMotm ? 1 : 0 }, ovrRating: updated.ovrRating },
        });
      }
    }
    return match.id;
  }, { maxWait: 10_000, timeout: 30_000 });
}