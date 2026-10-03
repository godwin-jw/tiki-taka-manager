import { notFound, redirect } from "next/navigation";
import { requireGroupMember } from "@/lib/legacy";
import { prisma } from "@/lib/prisma";
export default async function LegacyReport({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  await requireGroupMember(id);
  if (!await prisma.match.findFirst({ where: { id: matchId, groupId: id }, select: { id: true } })) notFound();
  redirect(`/grup/${id}`);
}