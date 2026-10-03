"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
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
  revalidatePath("/", "layout");
  return { success: "Profilin güncellendi." };
}

export async function becomeCaptain(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (form.get("confirm") !== "on") return { error: "Kaptan sorumluluklarını kabul etmelisin." };
  try { await prisma.user.update({ where: { id: user.id }, data: { role: "CAPTAIN" } }); }
  catch { return { error: "Yetki güncellenemedi. Tekrar deneyin." }; }
  revalidatePath("/", "layout");
  return { success: "Kaptanlık yetkin aktif. Artık maç oluşturabilirsin." };
}