import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createAuthAdapter } from "@/lib/auth-adapter";
import { isAllowedGoogleSignIn } from "@/lib/auth-policy";

export const authOptions = {
  adapter: createAuthAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ account, profile }) {
      return isAllowedGoogleSignIn(account?.provider, profile);
    },
    async session({ session, user }) {
      // Never trust client-supplied role updates or a stale JWT claim.
      const currentUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { id: true, role: true },
      });
      session.user.id = currentUser.id;
      session.user.role = currentUser.role;
      return session;
    },
  },
  theme: { colorScheme: "dark", brandColor: "#10b981" },
} satisfies NextAuthOptions;

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  return session.user;
}

// Match actions must ALSO check ownership; a role alone does not grant access.
export async function requireCaptain() {
  const user = await requireUser();
  if (user.role !== "CAPTAIN") throw new Error("Bu işlem için kaptan yetkisi gerekiyor.");
  return user;
}