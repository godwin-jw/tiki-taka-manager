"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { removeMatch } from "@/app/actions/global-match";

function DeleteButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  // A plain submit button, not AlertDialogAction: Radix closes the dialog when
  // that one is activated, which would discard a failed action's error message.
  // Staying open also keeps the confirmation box usable for a retry.
  return <Button
    type="submit"
    disabled={pending || !ready}
    className="bg-destructive text-white hover:bg-destructive/90"
  >
    {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
    {pending ? "Siliniyor…" : "Evet, maçı sil"}
  </Button>;
}

/**
 * Archive delete for a single match.
 *
 * Rendered only for the captain who created the match, but the real guard lives
 * in the server action: ownership is re-checked inside the transaction, so a
 * hand-crafted request cannot delete someone else's match.
 */
export function MatchDeleteControl({ matchId, teamAName, teamBName }: { matchId: string; teamAName: string; teamBName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action] = useActionState(removeMatch, {});

  // No effect closes the dialog on success: that would mean a setState inside an
  // effect, which risks a cascading render. Radix closes it when the action
  // button is activated, and the row leaves the archive on revalidation anyway.
  return <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger asChild>
      <Button variant="ghost" size="sm" className="shrink-0 text-zinc-400 hover:text-rose-300">
        <Trash2 />Maçı sil
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Bu maçı silmek istiyor musun?</AlertDialogTitle>
        <AlertDialogDescription>
          <strong>{teamAName}</strong> – <strong>{teamBName}</strong> karşılaşması arşivden kalıcı olarak kaldırılacak.
          <span className="mt-3 block font-medium text-rose-300">Bu işlem geri alınamaz.</span>
          <span className="mt-2 block text-xs">
            Maç kaydı, kadrosu ve raporu silinir. Oyuncuların geçmiş gol, asist ve maçın adamı istatistikleri
            korunur; yalnızca bu maça ait satırlar arşivden düşer.
          </span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form action={action} className="contents">
        <input type="hidden" name="matchId" value={matchId} />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            name="confirm"
            required
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
            className="size-4 accent-rose-400"
          />
          Bu maçı silmek istediğimi anlıyorum.
        </label>
        {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Vazgeç</AlertDialogCancel>
          <DeleteButton ready={confirmed} />
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}