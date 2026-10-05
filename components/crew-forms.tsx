"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Crown, Link2, LoaderCircle, LogOut, Send, Shield, ThumbsUp, UserPlus } from "lucide-react";
import { submitPeerVote } from "@/app/actions/rating";
import { searchUsersToInvite, sendCrewInvitation } from "@/app/actions/invitation";
import { acceptCrewInvitation, rejectCrewInvitation } from "@/app/actions/invitation";
import { cancelCrewRequestAction, createCrewAction, leaveCrewAction, requestToJoinAction, reviewCrewRequestAction } from "@/app/actions/crew";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Peer OVR voting between crew-mates.
 *
 * The slider mirrors the stored score so re-casting opens on the current value,
 * and the server re-validates crew membership regardless of what is submitted.
 */
export function PeerVoteButton({ crewId, targetUserId, name, image, currentOvr, existingVote }: {
  crewId: string;
  targetUserId: string;
  name: string;
  image: string | null;
  currentOvr: number;
  /** The viewer's own previous vote in this crew, if any. */
  existingVote: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitPeerVote, {});
  const [score, setScore] = useState(existingVote ?? Math.round(currentOvr));

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className="shrink-0 text-zinc-400 hover:text-emerald-300" aria-label={`${name} için OVR oyu ver`}>
        <ThumbsUp />Oy ver
      </Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <PlayerAvatar name={name} image={image} className="size-9" />
          {name} için OVR oyu
        </DialogTitle>
        <DialogDescription>
          OVR puanı, ekip arkadaşlarının verdiği oyların ortalamasıdır. Kendine oy veremezsin.
        </DialogDescription>
      </DialogHeader>
      <form action={action} className="space-y-6">
        <input type="hidden" name="crewId" value={crewId} />
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <input type="hidden" name="ovrRating" value={score} />
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor={`ovr-${targetUserId}`} className="text-sm font-medium">Puanın</label>
            <span className="font-mono text-3xl font-bold text-emerald-300">{score}</span>
          </div>
          <input
            id={`ovr-${targetUserId}`}
            type="range"
            min={0}
            max={99}
            value={score}
            onChange={event => setScore(Number(event.target.value))}
            className="w-full accent-emerald-400"
          />
          <div className="flex justify-between text-[10px] text-zinc-500"><span>0</span><span>99</span></div>
        </div>
        {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}
        <DialogFooter>
          <DialogClose type="button">Vazgeç</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <ThumbsUp />}
            {pending ? "Kaydediliyor…" : "Oyunu kaydet"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerAvatar } from "@/components/player-avatar";

function Feedback({ state }: { state: { error?: string; success?: string } }) {
  return <>{state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-300">{state.success}</p>}</>;
}

/**
 * Captain-only panel: pick a platform user and send them a direct invitation.
 *
 * The search is debounced so typing does not fire a request per keystroke, and
 * it runs through a Server Action which re-checks the captain's permission. The
 * client-side view is therefore only a convenience; the server decides who may be
 * invited and hides the rest.
 */
export function InvitePlayerDialog({ crewId }: { crewId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Which result the user last chose; sent as a hidden field with the form.
  const [pendingReceiver, setPendingReceiver] = useState<string | null>(null);
  const [searchState, searchAction, searching] = useActionState(searchUsersToInvite, {});
  const [sendState, sendAction, sending] = useActionState(sendCrewInvitation, {});

  // Debounce so a fast typist triggers one search instead of ten.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Only fire once there is something worth searching for. The form is submitted
  // rather than a hand-built FormData so the server always receives the crew id
  // and the current query.
  useEffect(() => {
    if (debounced.trim().length < 2) return;
    const form = document.getElementById(`invite-search-form-${crewId}`);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [debounced, crewId]);

  const results = (searchState.results as InviteResult[] | undefined) ?? [];
  const busy = searching || sending;

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="shrink-0"><UserPlus />Oyuncu Davet Et</Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Oyuncu Davet Et</DialogTitle>
        <DialogDescription>
          Kayıtlı oyuncuları isim veya e-posta ile ara ve davet gönder. Davet, oyuncunun
          gelen davetlerinden kabul edeceği bir bildirim olarak düşer.
        </DialogDescription>
      </DialogHeader>
      <form id={`invite-search-form-${crewId}`} action={searchAction} className="space-y-4">
        <input type="hidden" name="crewId" value={crewId} />
        <input type="hidden" name="query" value={debounced} />
        <div className="space-y-2">
          <label htmlFor="invite-search" className="text-sm font-medium">Oyuncu ara</label>
          <Input
            id="invite-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="İsim veya e-posta…"
            autoComplete="off"
            maxLength={60}
          />
          <p className="text-[11px] text-zinc-500">En az 2 karakter yaz. Sonuçlar otomatik aranır.</p>
        </div>
        {searching && <p className="text-sm text-zinc-500">Aranıyor…</p>}
        {searchState.error && <p role="alert" className="text-sm text-rose-300">{searchState.error}</p>}
        {sendState.error && <p role="alert" className="text-sm text-rose-300">{sendState.error}</p>}
        {sendState.success && <p role="status" className="text-sm text-emerald-300">{sendState.success}</p>}
        {/* The pending receiver is a field on the outer form, so the send action
            always receives it. Putting it on the button instead would lose it:
            a formAction dispatch does not carry the submitting control's name. */}
        <input type="hidden" name="receiverId" value={pendingReceiver ?? ""} />
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {results.length === 0 && debounced.trim().length >= 2 && !searching && !searchState.error
            ? <li className="py-4 text-center text-sm text-zinc-500">Eşleşen oyuncu bulunamadı.</li>
            : results.map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlayerAvatar name={entry.name} image={entry.image} className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{entry.name}</p>
                    <p className="text-xs text-zinc-500">{entry.ovrRating !== null ? `${entry.ovrRating} OVR` : "Profil yok"}</p>
                  </div>
                </div>
                {/* One form, not nested forms: a nested <form> is invalid HTML and the
                    browser discards it, which silently breaks the action. */}
                <Button
                  type="submit"
                  formAction={sendAction}
                  onClick={() => setPendingReceiver(entry.id)}
                  size="sm"
                  disabled={busy || entry.alreadyInvited}
                >
                  {entry.alreadyInvited ? "Davet gönderildi" : "Davet gönder"}
                </Button>
              </li>
            ))}
        </ul>
      </form>
    </DialogContent>
  </Dialog>;
}

type InviteResult = {
  id: string;
  name: string;
  image: string | null;
  ovrRating: number | null;
  position: string | null;
  alreadyInvited: boolean;
};

/**
 * Shareable join link with a copy button.
 *
 * The code is a bearer token: whoever holds the link can join, so the UI warns
 * about that explicitly and only managers ever see it.
 */
export function CrewInviteLink({ inviteCode, crewName }: { inviteCode: string; crewName: string }) {
  const [copied, setCopied] = useState(false);
  const href = `/davet/${inviteCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
    } catch {
      // Clipboard access can be denied by the browser; the read-only field still
      // lets the captain select and copy the link by hand.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return <section className="glass space-y-4 p-5">
    <div className="flex items-center gap-2">
      <Link2 className="size-4 text-emerald-400" />
      <h2 className="text-sm font-semibold">Davet Bağlantısı</h2>
    </div>
    <p className="text-xs text-zinc-400">
      Bu bağlantıyı paylaş; bağlantıya tıklayan kişi giriş yaptıktan sonra otomatik olarak
      <strong className="text-zinc-300"> {crewName}</strong> ekibine katılır.
    </p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={href} onFocus={event => event.currentTarget.select()} aria-label="Davet bağlantısı" className="font-mono text-xs" />
      <Button type="button" onClick={copy} variant="outline" className="shrink-0">
        {copied ? <Check /> : <Copy />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </Button>
    </div>
    <p className="text-[11px] text-amber-300/90">
      Bu kodu elinde olan herkes ekibe katılabilir. Yalnızca güvendiğin kişilerle paylaş.
    </p>
  </section>;
}

/**
 * Incoming invitation inbox.
 *
 * Accept is a real form submit, not an optimistic client toggle: joining a crew
 * writes a membership row, so the server decides and the page revalidates.
 */
export function IncomingInvitationsPanel({ invitations }: { invitations: IncomingInvitation[] }) {
  const [acceptState, acceptAction, accepting] = useActionState(acceptCrewInvitation, {});
  const [rejectState, rejectAction, rejecting] = useActionState(rejectCrewInvitation, {});
  if (invitations.length === 0) return null;
  const busy = accepting || rejecting;

  return <section aria-label="Gelen davetler" className="glass space-y-5 p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <UserPlus className="size-5 text-emerald-300" />Gelen Davetler
      </h2>
      <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">{invitations.length} bekleyen</span>
    </div>
    {acceptState.error && <p role="alert" className="text-sm text-rose-300">{acceptState.error}</p>}
    {rejectState.error && <p role="alert" className="text-sm text-rose-300">{rejectState.error}</p>}
    {rejectState.success && <p role="status" className="text-sm text-emerald-300">{rejectState.success}</p>}
    <ul className="space-y-3">{invitations.map(invitation => {
      const label = invitation.sender.name || "Oyuncu";
      return <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerAvatar name={label} image={invitation.sender.image} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              <strong className="text-emerald-300">{invitation.crew.name}</strong> ekibine davet edildin
            </p>
            <p className="text-xs text-zinc-500">{label} gönderdi · {invitation.crew.memberCount} üye</p>
          </div>
        </div>
        <div className="flex gap-2">
          <form action={acceptAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <input type="hidden" name="crewId" value={invitation.crew.id} />
            <Button type="submit" size="sm" disabled={busy}>{accepting ? <LoaderCircle className="animate-spin" /> : <Check />}Kabul et</Button>
          </form>
          <form action={rejectAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <Button type="submit" size="sm" variant="outline" disabled={busy}>{rejecting ? <LoaderCircle className="animate-spin" /> : <Send />}Reddet</Button>
          </form>
        </div>
      </li>;
    })}</ul>
  </section>;
}

export type IncomingInvitation = {
  id: string;
  createdAt: Date;
  crew: { id: string; name: string; logo: string | null; memberCount: number };
  sender: { id: string; name: string | null; image: string | null };
};

/**
 * One-shot success banner after joining through an invite link.
 *
 * Driven by the `katildi` query flag rather than client state, so it survives the
 * redirect and can never be replayed by clicking a stale button.
 */
export function JoinSuccessToast({ joined, crewName }: { joined: boolean; crewName: string }) {
  if (!joined) return null;
  return <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
    <Check className="size-4 shrink-0" />
    <strong className="text-emerald-100">{crewName}</strong> ekibine başarıyla katıldın. Hoş geldin!
  </p>;
}

export function CreateCrewForm() {
  const [state, action, pending] = useActionState(createCrewAction, {});
  return <form action={action} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="crew-name">Ekip adı</Label><Input id="crew-name" name="name" required minLength={3} maxLength={40} placeholder="Kartal SK" /></div>
    <p className="text-[11px] text-zinc-500">Ekipi sen kurduğunda otomatik olarak kaptan olursun.</p>
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Shield />}{pending ? "Kuruluyor…" : "Ekip kur"}</Button>
  </form>;
}

export function JoinCrewForm({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(requestToJoinAction, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="crewId" value={crewId} />
    <div className="space-y-2"><Label htmlFor={`join-message-${crewId}`}>Kaptana not <span className="text-xs text-zinc-500">(isteğe bağlı)</span></Label><Input id={`join-message-${crewId}`} name="message" maxLength={200} placeholder="Mevki ve beklentini yaz." /></div>
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}{pending ? "Gönderiliyor…" : "Katılma isteği gönder"}</Button>
  </form>;
}

export function CancelRequestButton({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(cancelCrewRequestAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="crewId" value={crewId} />
    <Feedback state={state} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : null}{pending ? "Geri çekiliyor…" : "İsteği geri çek"}</Button>
  </form>;
}

export function LeaveCrewButton({ crewId }: { crewId: string }) {
  const [state, action, pending] = useActionState(leaveCrewAction, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="crewId" value={crewId} />
    <Feedback state={state} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}{pending ? "Ayrılıyor…" : "Ekipten ayrıl"}</Button>
  </form>;
}

export function CrewSearchForm({ query }: { query: string }) {
  return <form role="search" className="flex gap-2">
    <Input name="q" defaultValue={query} placeholder="Ekip ara…" aria-label="Ekip adına göre ara" minLength={2} maxLength={40} />
    <Button type="submit" variant="outline">Ara</Button>
  </form>;
}

export function BackToCrewsLink() {
  return <Link href="/ekipler" className="text-xs text-zinc-400 hover:text-white">← Ekipler listesine dön</Link>;
}

type PendingRequest = {
  id: string;
  message: string | null;
  user: { id: string; name: string | null; image: string | null; playerProfile: { ovrRating: number; position: string } | null };
};

/** Captain-only panel: every pending request with accept / reject actions. */
export function CrewRequestsPanel({ crewId, requests }: { crewId: string; requests: PendingRequest[] }) {
  const [state, action, pending] = useActionState(reviewCrewRequestAction, {});
  return <section aria-label="Katılma istekleri" className="glass space-y-5 p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Crown className="size-5 text-amber-300" />Katılma istekleri</h2>
      <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">{requests.length} bekleyen</span>
    </div>
    <Feedback state={state} />
    {requests.length === 0
      ? <p className="text-sm text-zinc-500">Bekleyen istek yok. Yeni istekler burada görünecek.</p>
      : <ul className="space-y-3">{requests.map(request => {
        const profile = request.user.playerProfile;
        const label = request.user.name || "Oyuncu";
        return <li key={request.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <PlayerAvatar name={label} image={request.user.image} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label}</p>
              <p className="text-xs text-zinc-500">{profile ? `${profile.position} · ${Math.round(profile.ovrRating)} OVR` : "Profil yok"}{request.message ? ` · "${request.message}"` : ""}</p>
            </div>
          </div>
          <form action={action} className="flex gap-2" aria-label={`${label} isteğini yönet`}>
            <input type="hidden" name="crewId" value={crewId} />
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" name="decision" value="ACCEPT" size="sm" disabled={pending} aria-label={`${label} ekibe katıl`}>{pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Kabul et</Button>
            <Button type="submit" name="decision" value="REJECT" size="sm" variant="outline" disabled={pending} aria-label={`${label} isteğini reddet`}>{pending ? <LoaderCircle className="animate-spin" /> : <Send />}Reddet</Button>
          </form>
        </li>;
      })}</ul>}
  </section>;
}