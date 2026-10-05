import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, signInPath } from "@/lib/auth";
import { joinCrewByInviteCode } from "@/lib/invitation-service";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = { title: "Davet" };

/**
 * Invite-link onboarding.
 *
 * Flow, entirely server-side:
 *  1. no session -> redirect to sign-in with `callbackUrl` pointing back here, so
 *     the visitor returns to this exact link after Google sign-in;
 *  2. signed in -> resolve the code, join the crew if possible, then redirect to
 *     the crew page carrying a one-shot `katildi` flag that renders the toast.
 *
 * The join itself runs in joinCrewByInviteCode, inside a transaction, and every
 * branch is safe to hit twice: opening the link again after joining lands on the
 * crew page instead of erroring.
 */
export default async function InvitePage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  const session = await getServerSession(authOptions);

  // Step 1: remember where they were going before sending them to Google.
  if (!session?.user?.id) redirect(signInPath(`/davet/${encodeURIComponent(inviteCode)}`));

  // Step 2: join and land on the crew page. `joined` distinguishes a fresh join
  // from "you were already a member", which drives the toast wording.
  // A malformed code throws during normalisation; that is the same user-facing
  // outcome as an unknown one, so it is folded into the invalid branch.
  let result;
  try {
    result = await joinCrewByInviteCode(prisma, session.user.id, inviteCode);
  } catch {
    redirect("/davet/gecersiz");
  }

  if (result.outcome === "invalid") {
    return <InviteScreen
      tone="error"
      title="Davet linki geçersiz"
      body="Bu bağlantı tanınmıyor veya kaldırılmış. Ekip kaptanından yeni bir bağlantı iste."
      action={<Button asChild><Link href="/ekipler">Ekipleri keşfet</Link></Button>}
    />;
  }

  if (result.outcome === "full") {
    return <InviteScreen
      tone="error"
      title="Ekip dolu"
      body={`${result.crewName} şu anda üye sınırına ulaştı. Biraz sonra tekrar dene veya kaptanına ulaş.`}
      action={<Button asChild><Link href="/ekipler">Ekipleri keşfet</Link></Button>}
    />;
  }

  // "joined" and "already" both land on the crew page; only the flag differs.
  redirect(`/ekip/${result.crewId}?katildi=${result.outcome === "joined" ? "1" : "0"}`);
}

/** Shared shell for the two non-redirect outcomes. */
function InviteScreen({ tone, title, body, action }: {
  tone: "error";
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
    <section className="glass w-full space-y-5 p-8 text-center">
      <p className={`eyebrow ${tone === "error" ? "text-rose-400" : ""}`}>DAVET</p>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm leading-6 text-zinc-400">{body}</p>
      <div className="flex justify-center">{action}</div>
    </section>
  </div>;
}
