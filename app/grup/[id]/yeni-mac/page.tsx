import { redirect } from "next/navigation";
import { requireGroupMember } from "@/lib/legacy";
export default async function LegacyNewMatch({ params }: { params: Promise<{ id: string }> }) {
  await requireGroupMember((await params).id);
  redirect("/yeni-mac");
}