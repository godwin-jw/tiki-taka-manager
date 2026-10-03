import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return <section className="glass space-y-5 p-10 text-center"><p className="eyebrow">404 / OUT OF PLAY</p><h1 className="text-2xl font-bold">Bu sayfa saha dışında.</h1><p className="text-sm text-zinc-400">Kayıt bulunamadı veya bu kayda erişimin yok.</p><Button asChild><Link href="/">Kulüp merkezine dön</Link></Button></section>;
}