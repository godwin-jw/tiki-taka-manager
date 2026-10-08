"use client";

import { useTransition } from "react";
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
 * the same workspace without a URL parameter. Writing that cookie makes Next
 * re-render the current route in the action's own response, which is what makes
 * the switch appear everywhere at once.
 */
export function WorkspaceSwitcher({ crews, activeCrewId }: {
  crews: Array<{ id: string; name: string }>;
  activeCrewId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const active = crews.find((crew) => crew.id === activeCrewId) ?? crews[0];
  if (!active) return null;

  function choose(crewId: string) {
    if (crewId === active?.id || pending) return;
    startTransition(async () => {
      // The server re-validates membership; an invalid id is simply ignored.
      // The cookie write inside the action already re-renders the page in the
      // same response, so no router.refresh() (a second full render) follows.
      await setActiveCrew(crewId);
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

// There used to be an `ActiveCrewSync` effect here that persisted the fallback
// workspace through setActiveCrew on a first visit. It was removed: the server
// resolves the very same crew (earliest membership) whenever the cookie is
// missing or stale, so the cookie carried no information, and writing it made
// Next re-render the whole page a second time right after the first paint.