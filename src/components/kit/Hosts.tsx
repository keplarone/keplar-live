"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { ToastProvider, useToast, type ToastOptions } from "./Toast";

/**
 * Site-wide hosts for the two imperative pieces of the kit, mounted once in the root layout (<KitHosts />):
 *   confirmAction({ title, body, confirmLabel, danger }) → Promise<boolean>   a real dialog instead of window.confirm
 *   notify({ title, description, tone, action })                               a toast, from anywhere (no provider needed)
 * Before this, eleven places used the browser's window.confirm and about ten components drew their own toast.
 */

export type ConfirmOptions = {
  title: string;
  /** One or two plain sentences: what happens, and whether it can be undone. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** A destructive action: the confirm button is the danger variant. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let openConfirm: ((p: Pending) => void) | null = null;
let showToast: ((t: ToastOptions) => void) | null = null;

/** Asks for confirmation in a dialog. Resolves false on Cancel, Escape or a backdrop click. Falls back to window.confirm before the host mounts. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!openConfirm) return Promise.resolve(typeof window !== "undefined" && window.confirm([options.title, options.body].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => openConfirm!({ ...options, resolve }));
}

/** Shows a toast from anywhere (no hook). A no-op on the server or before the host mounts. */
export function notify(options: ToastOptions): void {
  showToast?.(options);
}

function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  useEffect(() => {
    openConfirm = (next) => setP((cur) => { cur?.resolve(false); return next; });
    return () => { openConfirm = null; };
  }, []);
  const done = (ok: boolean) => { p?.resolve(ok); setP(null); };
  return (
    <Dialog
      open={Boolean(p)}
      onOpenChange={(open) => { if (!open) done(false); }}
      title={p?.title ?? ""}
      description={p?.body}
      size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => done(false)}>{p?.cancelLabel ?? "Cancel"}</Button>
        <Button variant={p?.danger ? "danger" : "primary"} onClick={() => done(true)} data-confirm-yes="">{p?.confirmLabel ?? "Continue"}</Button>
      </>}
    />
  );
}

function ToastBridge() {
  const api = useToast();
  useEffect(() => {
    showToast = (t) => { api.show(t); };
    return () => { showToast = null; };
  }, [api]);
  return null;
}

/** Mounted once in the root layout. The wrapper is marked data-kit-host so full-screen surfaces that make the rest of the page
 *  inert (the /app shell does) leave it alone: its toasts and confirm dialog serve them. */
export function KitHosts() {
  return (
    <div data-kit-host="">
      <ToastProvider placement="bottom-center">
        <ToastBridge />
        <ConfirmHost />
      </ToastProvider>
    </div>
  );
}
