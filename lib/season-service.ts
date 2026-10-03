import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Returns the live season, creating "Sezon 1" on first use.
 *
 * The partial unique index guarantees at most one active season, so callers
 * must deactivate the previous season before activating a replacement.
 */
export async function ensureActiveSeason(now = new Date()) {
  const existing = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  if (existing) return existing;
  return prisma.season.create({
    data: {
      name: "Sezon 1",
      startDate: new Date(now.getFullYear(), 0, 1),
      endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
      isActive: true,
    },
    select: { id: true, name: true },
  });
}

/**
 * Rolls the season over: the current season is closed and the next one becomes
 * active. Both writes run in one transaction so the database never observes two
 * active seasons (or none) mid-switch.
 */
export async function advanceToNextSeason(nextName: string, now = new Date()) {
  const trimmed = nextName.trim();
  if (trimmed.length < 3 || trimmed.length > 40) throw new Error("Sezon adı 3–40 karakter olmalıdır.");
  return prisma.$transaction(async (tx) => {
    const current = await tx.season.findFirst({ where: { isActive: true }, select: { id: true, name: true, endDate: true } });
    if (current && current.name === trimmed) throw new Error("Bu isimde bir sezon zaten var.");
    if (!current) throw new Error("Aktif sezon bulunamadı.");
    // Deactivate first: the partial unique index would reject a second active row.
    await tx.season.update({ where: { id: current.id }, data: { isActive: false, endDate: now } });
    const year = now.getFullYear();
    return tx.season.create({
      data: { name: trimmed, startDate: now, endDate: new Date(year + 1, 11, 31, 23, 59, 59), isActive: true },
      select: { id: true, name: true },
    });
  });
}
