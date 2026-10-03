import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="space-y-6" role="status" aria-label="Sayfa yükleniyor"><Skeleton className="h-10 w-64" /><Skeleton className="h-56 w-full" /><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}</div></div>;
}