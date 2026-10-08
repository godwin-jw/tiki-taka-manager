"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useState, useTransition, type MouseEvent } from "react";
import { ChevronDown, LoaderCircle, Shield } from "lucide-react";
import { setActiveCrew } from "@/app/actions/active-crew";
import { useNotice } from "@/components/notice-provider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type CrewNavItem = { id: string; name: string };

type CrewNavProps = {
  /** Crews the viewer is a CrewMember of (already loaded by the root layout). */
  crews: ReadonlyArray<CrewNavItem>;
  /** Validated workspace crew; only used to mark it in the submenu. */
  activeCrewId: string | null;
  /** Lets the mobile sheet close itself once a destination was chosen. */
  onNavigate?: () => void;
};

const crewHref = (crewId: string) => `/ekip/${crewId}`;

/** Same look as the plain sidebar links in app-shell, so the item blends in. */
function itemClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
    active ? "bg-emerald-400/10 text-emerald-300" : "text-zinc-400 hover:bg-white/5 hover:text-white",
  );
}

/**
 * Context-aware "Ekibim" sidebar entry.
 *
 * - 0 crews:  nudges the user to /ekipler with a toast.
 * - 1 crew:   behaves like a normal link to /ekip/[id].
 * - 2+ crews: collapsible submenu listing every crew.
 *
 * Whenever a crew is picked, the HTTP-only active-crew cookie is written through
 * the `setActiveCrew` server action BEFORE the route changes. That ordering keeps
 * the workspace switcher and the dashboard in sync with the page the user just
 * opened. Memoised so typing in the roster search (which re-renders the sidebar
 * on every keystroke) does not re-render this item.
 */
export const CrewNav = memo(function CrewNav({ crews, activeCrewId, onNavigate }: CrewNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const notify = useNotice();
  const [pending, startTransition] = useTransition();
  const [targetId, setTargetId] = useState<string | null>(null);

  const currentCrewId = crews.find((crew) => pathname === crewHref(crew.id))?.id ?? null;
  // Start expanded when the user is already looking at one of their crews.
  const [open, setOpen] = useState(currentCrewId !== null);

  const selectCrew = useCallback((event: MouseEvent<HTMLAnchorElement>, crewId: string) => {
    if (event.defaultPrevented) return;
    // "Open in new tab" gestures stay native; the cookie is still synced.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      void setActiveCrew(crewId).catch(() => undefined);
      return;
    }
    event.preventDefault();
    if (pending) return;
    setTargetId(crewId);
    startTransition(async () => {
      try {
        // The server re-validates membership and revalidates the whole layout.
        await setActiveCrew(crewId);
      } catch {
        // Do not navigate on failure: the page and the workspace must not diverge.
        notify("Aktif ekip güncellenemedi, tekrar deneyin");
        return;
      }
      router.push(crewHref(crewId));
      onNavigate?.();
    });
  }, [notify, onNavigate, pending, router]);

  const goToCrews = useCallback(() => {
    notify("Önce bir ekibe katılın");
    router.push("/ekipler");
    onNavigate?.();
  }, [notify, onNavigate, router]);

  if (crews.length === 0) {
    return (
      <button type="button" onClick={goToCrews} title="Önce bir ekibe katılın" className={cn(itemClass(false), "text-zinc-500")}>
        <Shield className="size-4" />Ekibim
      </button>
    );
  }

  if (crews.length === 1) {
    const [crew] = crews;
    const href = crewHref(crew.id);
    return (
      <Link href={href} onClick={(event) => selectCrew(event, crew.id)} aria-current={pathname === href ? "page" : undefined} className={itemClass(pathname === href)}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Shield className="size-4" />}Ekibim
      </Link>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className={itemClass(currentCrewId !== null)}>
          <Shield className="size-4" />
          <span className="flex-1 text-left">Ekibim</span>
          <span className="rounded bg-zinc-800 px-2 text-xs text-zinc-400">{crews.length}</span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul aria-label="Ekiplerim" className="mt-1 ml-5 space-y-1 border-l border-white/10 pl-3">
          {crews.map((crew) => {
            const href = crewHref(crew.id);
            const current = pathname === href;
            return (
              <li key={crew.id}>
                <Link
                  href={href}
                  onClick={(event) => selectCrew(event, crew.id)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    current ? "bg-emerald-400/10 text-emerald-300" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{crew.name}</span>
                  {pending && targetId === crew.id
                    ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                    : crew.id === activeCrewId && <span className="size-1.5 shrink-0 rounded-full bg-emerald-400"><span className="sr-only">Aktif ekip</span></span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
});

