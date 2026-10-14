"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, IconButton } from "./Button";
import { cx } from "./cx";
import { defaultToastDuration, type ToastTone } from "./feedback-logic";
import { useReducedMotion } from "./hooks";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/glyphs";
import o from "./overlay.module.css";


export type { ToastTone };

export interface ToastOptions {
  title: string;
  /** One or two short lines. */
  description?: string;
  tone?: ToastTone;
  /** One optional action (e.g. "Undo", "View diff"). Runs, then the toast closes. */
  action?: { label: string; onClick: () => void };
  /** ms before it closes by itself; 0 keeps it until dismissed. Default 5000, and 0 for "danger" (errors wait for the person). */
  duration?: number;
  /** Reuse an id to replace a toast in place (e.g. the same sync result arriving twice). */
  id?: string;
}

interface ToastRecord extends Required<Pick<ToastOptions, "title" | "tone" | "duration">> {
  id: string;
  description?: string;
  action?: ToastOptions["action"];
  leaving: boolean;
  /** Bumped on every show(), so a toast replaced in place by id restarts its timer with the new duration. */
  rev: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 4;
const TONE_ICON: Record<ToastTone, IconName> = { neutral: "info", success: "check", warning: "warning", danger: "error", info: "info" };


let seq = 0;

export interface ToastProviderProps {
  children: ReactNode;
  placement?: "bottom-right" | "bottom-center" | "top-right";
}

/**
 * Notification stack. Put it inside <StudioRoot> (it uses the Studio tokens). Toasts enter with a short slide + scale and
 * leave the same way; hovering or focusing a toast pauses its timer. Polite announcements; "danger" toasts are alerts.
 */
export function ToastProvider({ children, placement = "bottom-right" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const reduced = useReducedMotion();

  const remove = useCallback((id: string) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const dismiss = useCallback(
    (id: string) => {
      if (reduced) remove(id);
      else setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    },
    [reduced, remove],
  );
  const show = useCallback((opts: ToastOptions) => {
    const tone = opts.tone ?? "neutral";
    const id = opts.id ?? `ks-toast-${++seq}`;
    const rec: ToastRecord = {
      id,
      title: opts.title,
      description: opts.description,
      tone,
      action: opts.action,
      duration: opts.duration ?? defaultToastDuration(tone),
      leaving: false,
      rev: ++seq,
    };
    setToasts((all) => {
      const rest = all.filter((t) => t.id !== id);
      return [...rest, rec].slice(-MAX_VISIBLE);
    });
    return id;
  }, []);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ol className={o.toasts} data-placement={placement} aria-live="polite" aria-relevant="additions" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} onGone={remove} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

/** The toast API of the nearest <ToastProvider>. Throws outside one (a missing provider is a wiring bug, not a no-op). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() must be used inside <ToastProvider>");
  return api;
}

function ToastItem({ toast, onDismiss, onGone }: { toast: ToastRecord; onDismiss: (id: string) => void; onGone: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(0);
  const rev = useRef(toast.rev);

  useEffect(() => {
    if (rev.current !== toast.rev) {
      rev.current = toast.rev;
      remaining.current = toast.duration;
    }
    if (toast.duration <= 0 || paused || toast.leaving) return;
    startedAt.current = Date.now();
    const t = window.setTimeout(() => onDismiss(toast.id), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [toast.duration, toast.id, toast.rev, toast.leaving, paused, onDismiss]);

  return (
    <li
      className={cx(o.toast)}
      data-motion="ks"
      data-tone={toast.tone}
      data-leaving={toast.leaving ? "" : undefined}
      // the <ol> is already a polite live region; only errors interrupt (role=alert) to avoid double announcements
      role={toast.tone === "danger" ? "alert" : undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onAnimationEnd={(e) => {
        if (toast.leaving && e.target === e.currentTarget) onGone(toast.id);
      }}
    >
      <span className={o.toastMark}>
        <Icon name={TONE_ICON[toast.tone]} size={16} />
      </span>
      <div className={o.toastBody}>
        <span className={o.toastTitle}>{toast.title}</span>
        {toast.description ? <span className={o.toastText}>{toast.description}</span> : null}
      </div>
      <div className={o.toastActions}>
        {toast.action ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </Button>
        ) : null}
        <IconButton size="sm" label="Dismiss notification" tooltip={false} icon={<Icon name="close" size={14} />} onClick={() => onDismiss(toast.id)} />
      </div>
    </li>
  );
}
