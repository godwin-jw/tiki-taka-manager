"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, Pencil, Settings, Trash2, TriangleAlert } from "lucide-react";
import { deleteCrew, renameCrew } from "@/app/actions/crew";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Same whitespace rule the server applies before comparing names. */
const squash = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Rename form. Stays open (and locked) until the server confirms, so a refusal
 * such as "name already taken" remains readable next to the field. The action
 * revalidates the layout, which refreshes the page title, the header switcher
 * and the sidebar in the same round trip, so no router.refresh() is needed.
 */
function RenameDialog({ crewId, currentName, open, onOpenChange }: {
  crewId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fieldId = useId();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const candidate = squash(name);
  const canSubmit = !pending && candidate.length >= 3 && candidate !== currentName;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    startTransition(async () => {
      const result = await renameCrew(crewId, name);
      if (result.error) { setError(result.error); return; }
      onOpenChange(false);
    });
  }

  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Ekibi yeniden adlandır</DialogTitle>
        <DialogDescription>Yeni ad tüm üyeler için hemen geçerli olur. Maç geçmişi ve istatistikler değişmez.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={fieldId}>Yeni ekip adı</Label>
          <Input id={fieldId} value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={40} disabled={pending} autoComplete="off" />
        </div>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <DialogFooter>
          <DialogClose type="button" disabled={pending}>Vazgeç</DialogClose>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Pencil />}{pending ? "Kaydediliyor…" : "Adı kaydet"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/**
 * Destructive confirmation: the delete button stays disabled until the crew's
 * exact name has been typed. This is a convenience, not the guard - deleteCrew
 * receives the typed name and compares it on the server as well.
 *
 * The confirm button is a plain submit button rather than AlertDialogAction on
 * purpose: Action closes the dialog the moment it is clicked, which would hide
 * a server refusal and the loading state. On success the action redirects, so
 * the whole page (and this dialog) is replaced.
 */
function DeleteDialog({ crewId, crewName, open, onOpenChange }: {
  crewId: string;
  crewName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const confirmed = squash(typed) === squash(crewName);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || pending) return;
    setError("");
    startTransition(async () => {
      // On success the action redirects (the promise rejects with Next's
      // redirect signal, which the router handles), so only refusals return.
      const result = await deleteCrew(crewId, typed);
      if (result.error) setError(result.error);
    });
  }

  return <AlertDialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
    <AlertDialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
      <form onSubmit={submit} className="grid gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-rose-300"><TriangleAlert className="size-5" />{crewName} silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            Bu işlem geri alınamaz. Ekip; tüm üyelikleri, bekleyen istek ve davetleri, ekip içi oyları ve ekibin
            bütün maçlarıyla birlikte kalıcı olarak silinir. Onaylanmış ekip maçlarının oyunculara yazdığı gol, asist ve
            MOTM değerleri geri alınır. Oyuncu hesapları ve diğer ekiplerdeki kayıtlar silinmez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={fieldId}>Onaylamak için ekibin adını yazın: <strong className="select-all text-zinc-100">{crewName}</strong></Label>
          <Input id={fieldId} value={typed} onChange={event => setTyped(event.target.value)} disabled={pending} autoComplete="off" spellCheck={false} placeholder={crewName} />
        </div>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Vazgeç</AlertDialogCancel>
          <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{pending ? "Siliniyor…" : "Ekibi kalıcı olarak sil"}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}

/**
 * "Ekip yönetimi" dropdown for the crew header. The page only renders it for the
 * crew's OWNER, and both actions re-check that on the server, so hiding it here
 * is a convenience and never the guard. Each dialog is re-keyed on every open so
 * it always starts from fresh state (current name, empty confirmation field).
 */
export function CrewManageMenu({ crewId, crewName }: { crewId: string; crewName: string }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameRun, setRenameRun] = useState(0);
  const [deleteRun, setDeleteRun] = useState(0);

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Ekip yönetimi" className="shrink-0 text-zinc-400 hover:text-emerald-300"><Settings /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[10px] tracking-widest text-zinc-500">EKİP YÖNETİMİ</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { setRenameRun(run => run + 1); setRenameOpen(true); }}><Pencil />Yeniden adlandır</DropdownMenuItem>
        <DropdownMenuItem className="text-rose-300 focus:text-rose-200" onSelect={() => { setDeleteRun(run => run + 1); setDeleteOpen(true); }}><Trash2 />Ekibi sil</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <RenameDialog key={`rename-${renameRun}`} crewId={crewId} currentName={crewName} open={renameOpen} onOpenChange={setRenameOpen} />
    <DeleteDialog key={`delete-${deleteRun}`} crewId={crewId} crewName={crewName} open={deleteOpen} onOpenChange={setDeleteOpen} />
  </>;
}
