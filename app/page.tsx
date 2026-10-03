import { Suspense } from "react";
import { getSession } from "@/lib/data";
import { Dashboard, Welcome } from "@/components/dashboard";
import Loading from "@/app/loading";

export default async function Home() {
  const session = await getSession();
  if (!session) return <Welcome />;
  return <Suspense fallback={<Loading />}><Dashboard userId={session.user.id} name={session.user.name || "Oyuncu"} /></Suspense>;
}