"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { ROSTER_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { parseProfile, ValidationError } from "@/lib/validation";
import type { ActionState } from "@/lib/football";

export async function updateProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { name, phone, position, jerseyNumber } = parseProfile(form);
    await prisma.user.update({
      where: { id: user.id },
      data: { name, phone, playerProfile: { upsert: { create: { position, jerseyNumber }, update: { position, jerseyNumber } } } },
    });
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "Bu telefon numarası başka bir hesapta kullanılıyor." };
    return { error: "Profil kaydedilemedi. Lütfen tekrar deneyin." };
  }
  // The name and position feed the global roster in the sidebar; everything else
  // that shows this profile is rendered per request.
  updateTag(ROSTER_TAG);
  revalidatePath("/profil");
  return { success: "Profilin güncellendi." };
}

export async function becomeCaptain(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (form.get("confirm") !== "on") return { error: "Kaptan sorumluluklarını kabul etmelisin." };
  try { await prisma.user.update({ where: { id: user.id }, data: { role: "CAPTAIN" } }); }
  catch { return { error: "Yetki güncellenemedi. Tekrar deneyin." }; }
  // The role lives on the session, which is resolved per request: only the
  // profile page (and the layout it renders in) has to be re-rendered.
  revalidatePath("/profil");
  return { success: "Kaptanlık yetkin aktif. Artık maç oluşturabilirsin." };
}