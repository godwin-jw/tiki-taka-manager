"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastViewport } from "@/components/ui/toast";

type Notify = (message: string) => void;
type Notice = { id: number; message: string; open: boolean };

/** At most this many toasts are on screen at once; older ones are dropped first. */
const MAX_VISIBLE = 3;

const NoticeContext = createContext<Notify>(() => undefined);

/**
 * Shows a short, non-blocking toast.
 *
 * The provider lives in the app shell (which survives navigation), so a toast
 * raised right before a route change - e.g. "Önce bir ekibe katılın" - is still
 * on screen once the next page has rendered. `notify` is referentially stable,
 * so consumers never re-render because a toast appeared.
 */
export function useNotice(): Notify {
  return useContext(NoticeContext);
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);

  const notify = useCallback<Notify>((message) => {
    nextId.current += 1;
    const notice: Notice = { id: nextId.current, message, open: true };
    setNotices((current) => {
      // Repeated clicks must not stack identical toasts.
      if (current.some((entry) => entry.open && entry.message === message)) return current;
      // Closed toasts are pruned here, after their exit animation has run.
      return [...current.filter((entry) => entry.open).slice(-(MAX_VISIBLE - 1)), notice];
    });
  }, []);

  const close = useCallback((id: number) => {
    setNotices((current) => current.map((entry) => (entry.id === id ? { ...entry, open: false } : entry)));
  }, []);

  return (
    <NoticeContext value={notify}>
      <ToastProvider swipeDirection="right" duration={4500} label="Bildirimler ({hotkey})">
        {children}
        {notices.map((notice) => (
          <Toast key={notice.id} open={notice.open} onOpenChange={(open) => { if (!open) close(notice.id); }}>
            <Info className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
            <ToastDescription>{notice.message}</ToastDescription>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </NoticeContext>
  );
}
