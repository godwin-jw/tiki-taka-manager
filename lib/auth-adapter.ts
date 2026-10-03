import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Adapter, AdapterUser } from "next-auth/adapters";

export function createAuthAdapter(db: PrismaClient): Adapter {
  return {
    ...PrismaAdapter(db),
    async createUser(user: Omit<AdapterUser, "id">) {
      // Atomic nested create; OAuth payloads cannot assign roles or statistics.
      const created = await db.user.create({
        data: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          role: "PLAYER",
          playerProfile: { create: {} },
        },
      });
      return { ...created, email: user.email };
    },
  };
}