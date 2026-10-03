"use client";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="glass mx-auto max-w-xl space-y-4 p-10 text-center"><AlertTriangle className="mx-auto size-8 text-amber-300" /><h1 className="text-xl font-bold">Bağlantıda bir sorun var</h1><p className="text-sm text-zinc-400">Veriler şu an yüklenemiyor. Biraz sonra tekrar deneyin.</p><Button onClick={reset}>Tekrar dene</Button></section>;
}