import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Davet" };

/**
 * Landing spot for invite links whose code is malformed.
 *
 * /davet/[inviteCode] cannot render this case itself: a bad code throws while
 * being normalised, and a thrown error inside that route would surface as a
 * generic error page. Redirecting to a real route keeps the message on-brand and
 * lets the URL stay shareable/bookmarkable without pretending the code exists.
 */
export default function InvalidInvitePage() {
  return <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
    <section className="glass w-full space-y-5 p-8 text-center">
      <p className="eyebrow text-rose-400">DAVET</p>
      <h1 className="text-2xl font-bold">Davet linki geçersiz</h1>
      <p className="text-sm leading-6 text-zinc-400">
        Bu bağlantı tanınmıyor, süresi dolmuş ya da yanlış kopyalanmış olabilir.
        Ekip kaptanından yeni bir davet bağlantısı isteyebilirsin.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild><Link href="/ekipler">Ekipleri keşfet</Link></Button>
        <Button asChild variant="outline"><Link href="/">Kulüp merkezi</Link></Button>
      </div>
    </section>
  </div>;
}
