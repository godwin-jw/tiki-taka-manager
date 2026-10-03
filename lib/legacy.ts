import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireGroupMember(id: string) {
  const user = await requireUser();
  const group = await prisma.group.findFirst({ where: { id, OR: [{ captainId: user.id }, { players: { some: { userId: user.id } } }] }, select: { id: true, name: true } });
  if (!group) notFound();
  return group;
}