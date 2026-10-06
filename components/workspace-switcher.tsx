"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LoaderCircle, UsersRound } from "lucide-react";
import { setActiveCrew } from "@/app/actions/active-crew";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The workspace switcher: pick which crew is "active" for this session.
 *
 * The choice lives in an HTTP-only cookie written by the setActiveCrew server
 * action, so every crew-scoped surface (dashboard tabs, match creation) sees
 * the same workspace without a URL parameter. The action revalidates the whole
 * layout, which is what makes the switch appear everywhere at once.
 */
export function WorkspaceSwitcher({ crews, activeCrewId }: {
  crews: Array<{ id: string; name: string }>;
  activeCrewId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const active = crews.find((crew) => crew.id === activeCrewId) ?? crews[0];
  if (!active) return null;

  function choose(crewId: string) {
    if (crewId === active?.id || pending) return;
    startTransition(async () => {
      // The server re-validates membership; an invalid id is simply ignored.
      await setActiveCrew(crewId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={`Aktif ekip: ${active.name}. Ekip değiştir`}
          className="max-w-[14rem] justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <UsersRound className="size-4 shrink-0 text-emerald-400" />}
            <span className="truncate">{active.name}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] tracking-widest text-zinc-500">AKTİF EKİP</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {crews.map((crew) => (
          <DropdownMenuItem key={crew.id} disabled={pending} onSelect={() => choose(crew.id)}>
            <Check className={cn("size-4 text-emerald-400", crew.id === active.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{crew.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Persists the fallback workspace when the cookie was missing or stale.
 *
 * Server components can read but not write cookies, so the server passes down
 * the resolved crew plus a `needsSync` flag and this one-shot effect writes it
 * through the server action. Guarded by a ref so a re-render cannot loop the
 * action; once the cookie matches, needsSync turns false on the next request.
 */
export function ActiveCrewSync({ activeCrewId, needsSync }: { activeCrewId: string | null; needsSync: boolean }) {
  const sentRef = useRef(false);
  useEffect(() => {
    if (sentRef.current || !needsSync || !activeCrewId) return;
    sentRef.current = true;
    void setActiveCrew(activeCrewId);
  }, [activeCrewId, needsSync]);
  return null;
}