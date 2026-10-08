"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function ToastProvider(props: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-4 bottom-4 z-[100] m-0 flex w-[min(92vw,22rem)] list-none flex-col gap-2 p-0 outline-none",
        className
      )}
      {...props}
    />
  )
}

function Toast({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "bg-popover text-popover-foreground relative flex items-start gap-3 rounded-xl border border-white/10 p-4 pr-10 shadow-lg",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-4",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("min-w-0 flex-1 text-sm leading-5", className)}
      {...props}
    />
  )
}

function ToastClose({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      className={cn(
        "absolute top-3 right-3 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-hidden",
        className
      )}
      {...props}
    >
      <XIcon className="size-4" />
      <span className="sr-only">Kapat</span>
    </ToastPrimitive.Close>
  )
}

export { ToastProvider, ToastViewport, Toast, ToastDescription, ToastClose }
