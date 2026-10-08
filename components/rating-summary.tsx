import { ratingAttributes, type AttributeScores } from "@/lib/rating";

/**
 * Read-only six-attribute panel. The numbers come from the ACTIVE crew's votes
 * (count 0 = this crew has not voted yet) and the page offers no control to
 * change them: voting happens through the crew ballot, never here.
 */
export function RatingSummary({ scores, count, ovr, crewName }: { scores: AttributeScores; count: number; ovr: number | null; crewName?: string | null }) {
  return <section className="glass space-y-5 p-6" aria-label="Ekip değerlendirmesi">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">CREW RATINGS</p><h2 className="mt-2 text-lg font-semibold">Futbol özellikleri{crewName ? ` · ${crewName}` : ""}</h2></div><p className="text-xs text-zinc-400">{count > 0 ? `${count} oy` : "bu ekipte oy yok"} · <span className="font-mono text-emerald-300">{ovr === null ? "—" : ovr.toFixed(1)} OVR</span></p></div>
    {count === 0 && <p className="text-sm text-zinc-400">Bu ekip henüz değerlendirme yapmadı. Statlar bu ekibin ilk oyuyla birlikte dolar; başka ekiplerin oyları buraya taşınmaz.</p>}
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{ratingAttributes.map(attr => <div key={attr.key}><div className="mb-2 flex items-center justify-between"><span className="text-sm text-zinc-300">{attr.label} <span className="ml-1 text-[10px] text-zinc-500">{attr.code}</span></span><span className="font-mono text-emerald-300">{count ? scores[attr.key].toFixed(1) : "—"}</span></div><div role="meter" aria-label={`${attr.label} ortalaması`} aria-valuemin={0} aria-valuemax={99} aria-valuenow={scores[attr.key]} aria-valuetext={count ? scores[attr.key].toFixed(1) : "Henüz değerlendirilmedi"} className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${scores[attr.key] / 99 * 100}%` }} /></div></div>)}</div>
    <p className="text-xs leading-5 text-zinc-500">Her ekip kendi oyuncularını bağımsız değerlendirir ve oy yalnızca ekip içinden verilir. Her özellik için oyların ortalaması alınır; genel OVR altı özellik ortalamasının aritmetik ortalamasıdır. Bu sayfa salt okunurdur.</p>
  </section>;
}