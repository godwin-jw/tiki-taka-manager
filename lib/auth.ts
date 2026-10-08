import type { Role } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { redirect } from "next/navigation";
import { cache } from "react";
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
      // Database sessions: the adapter has just loaded this user row (role
      // included) in the same request, so the role is never a stale client or JWT
      // claim and no second lookup is needed. The query below is only a safety net
      // for an adapter that returns a user without the column.
      const role = (user as { role?: Role }).role
        ?? (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { role: true } })).role;
      session.user.id = user.id;
      session.user.role = role;
      return session;
    },
  },
  theme: { colorScheme: "dark", brandColor: "#10b981" },
} satisfies NextAuthOptions;

/**
 * The viewer's session, resolved at most once per request.
 *
 * Every call used to hit the database again (session + user lookup), so a page
 * that asked from the layout, the page and a helper paid for it three times.
 * `cache` dedupes within one render pass; outside a render (Server Actions,
 * route handlers) it simply calls through, so a role change made by an action is
 * never served stale to the re-render that follows it.
 */
export const getSession = cache(() => getServerSession(authOptions));

/**
 * Requires a signed-in user, or redirects to sign-in.
 *
 * `callbackUrl` is passed straight through to NextAuth so that a visitor who
 * followed an invite link lands back on that link after authenticating instead
 * of on the home page. Only same-origin paths are honoured: an absolute URL here
 * would turn the sign-in screen into an open redirect.
 */
export async function requireUser(callbackUrl?: string) {
  const session = await getSession();
  if (!session?.user?.id) redirect(signInPath(callbackUrl));
  return session.user;
}

/** Builds a same-origin sign-in URL, defaulting to the home page. */
export function signInPath(callbackUrl?: string) {
  const target = callbackUrl?.trim();
  // Reject absolute URLs and protocol-relative ones ("//evil.com").
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/api/auth/signin";
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(target)}`;
}

// Match actions must ALSO check ownership; a role alone does not grant access.
export async function requireCaptain() {
  const user = await requireUser();
  if (user.role !== "CAPTAIN") throw new Error("Bu işlem için kaptan yetkisi gerekiyor.");
  return user;
}