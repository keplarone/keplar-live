"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode, type RefObject } from "react";
import { dataState, exitFallbackMs, isMounted, phaseFor, presenceStep, type PresencePhase } from "@/lib/ui/presence";

/**
 * Motion variants (src/styles/motion.css). pop: menus, popovers, dialogs (scale 0.96 → 1 + fade, from --m-origin).
 * fade: scrims and backdrops. toast: rises from the bottom edge. tip: tooltips. sheet / drawer-*: panels from an edge.
 */
export type MotionVariant = "pop" | "fade" | "toast" | "tip" | "sheet" | "drop" | "drawer-left" | "drawer-right";

export type MotionAttrs = {
  "data-motion": MotionVariant;
  "data-state": "open" | "closed";
  onAnimationEnd?: (e: AnimationEvent<HTMLElement>) => void;
};

/**
 * The owner holds `open`. The element stays mounted while its exit animation plays, then unmounts on its own animationend
 * (or after the fallback timeout: nothing gets stuck open). It mounts in the same render `open` turns true, so focus effects
 * that run on open still find it.
 *
 *   const menu = usePresence(open);
 *   {menu.mounted ? <div role="menu" {...menu.motion("pop")}>…</div> : null}
 *
 * motion(variant) gives the element data-motion / data-state and the animationend handler; pass track=false for extra
 * elements that animate alongside (a scrim around the panel) so only one of them ends the exit.
 */
export function usePresence(open: boolean, opts?: { fallbackMs?: number }) {
  const [phase, setPhase] = useState<PresencePhase>(open ? "open" : "closed");
  const next = phaseFor(phase, open);
  if (next !== phase) setPhase(next); // adjusted during render (no extra commit with the overlay missing)
  const fallbackMs = opts?.fallbackMs;
  useEffect(() => {
    if (next !== "closing") return;
    const t = window.setTimeout(() => setPhase((p) => presenceStep(p, "timeout")), exitFallbackMs(undefined, fallbackMs));
    return () => window.clearTimeout(t);
  }, [next, fallbackMs]);
  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) setPhase((p) => presenceStep(p, "animationend"));
  }, []);
  const state = dataState(next);
  const motion = useCallback(
    (variant: MotionVariant, track = true): MotionAttrs => ({ "data-motion": variant, "data-state": state, ...(track ? { onAnimationEnd } : {}) }),
    [state, onAnimationEnd],
  );
  return { mounted: isMounted(next), state, closing: next === "closing", onAnimationEnd, motion };
}

/**
 * The parent unmounts the overlay (`{open ? <Dialog onClose={…} /> : null}`). close() plays the exit first and calls the
 * parent's onClose when it ends (or on the fallback timeout), so Escape, the scrim and the Close button all animate out
 * without changing the parent.
 *
 * A parent that can also close it from outside (a Cmd+K toggle) keeps it with usePresence and passes that presence as
 * `parent`: close() then just calls onClose, and the overlay shows the exit while the parent's presence is closing and hands
 * its animationend back.
 */
export type ExitParent = { closing: boolean; onAnimationEnd: (e: AnimationEvent<HTMLElement>) => void };

export function useExit(onClose: () => void, opts?: { fallbackMs?: number; parent?: ExitParent | null }) {
  const [own, setClosing] = useState(false);
  const parent = opts?.parent ?? null;
  const parentClosing = Boolean(parent?.closing);
  const closing = own || parentClosing;
  const done = useRef(false);
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; });
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    latest.current();
  }, []);
  // With a parent presence, closing is the parent's job: hand over at once and let its presence play the exit.
  const hasParent = useRef(Boolean(parent));
  useEffect(() => { hasParent.current = Boolean(parent); });
  const close = useCallback(() => { if (hasParent.current) latest.current(); else setClosing(true); }, []);
  const fallbackMs = opts?.fallbackMs;
  useEffect(() => {
    if (!own) return;
    const ms = exitFallbackMs(undefined, fallbackMs);
    const t = window.setTimeout(finish, ms);
    return () => window.clearTimeout(t);
  }, [own, finish, fallbackMs]);
  const parentEnd = parent?.onAnimationEnd;
  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (own) { if (e.target === e.currentTarget) finish(); }
    else if (parentClosing) parentEnd?.(e); // the parent's presence filters target === currentTarget and unmounts
  }, [own, parentClosing, parentEnd, finish]);
  const state: "open" | "closed" = closing ? "closed" : "open";
  const motion = useCallback(
    (variant: MotionVariant, track = true): MotionAttrs => ({ "data-motion": variant, "data-state": state, ...(track ? { onAnimationEnd } : {}) }),
    [state, onAnimationEnd],
  );
  return { close, closing, state, onAnimationEnd, motion };
}

type PresenceApi = ReturnType<typeof usePresence>;

/**
 * Keeps the last value on screen while it animates out: `<Presence value={toast}>{(t, p) => <Toast {...t} {...p.motion("toast")} />}</Presence>`.
 * A new value replaces the old one directly (give it a key to replay the enter animation).
 */
export function Presence<T>({ value, children, fallbackMs }: { value: T | null | undefined | false; children: (value: T, presence: PresenceApi) => ReactNode; fallbackMs?: number }) {
  const shown = value !== null && value !== undefined && value !== false;
  const p = usePresence(shown, { fallbackMs });
  const [last, setLast] = useState<T | null>(shown ? (value as T) : null);
  if (shown && value !== last) setLast(value as T);
  const current = shown ? (value as T) : last;
  if (!p.mounted || current === null) return null;
  return children(current, p);
}

/**
 * Grows a popup out of its trigger: on open, sets --m-origin on the popup to the trigger's center (x) and the popup edge
 * nearest the trigger (y). One read per open, before paint; nothing runs while the popup is open or on keystrokes.
 */
export function usePopupOrigin(open: boolean, triggerRef: RefObject<HTMLElement | null>, popupRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current, p = popupRef.current;
    if (!t || !p) return;
    const a = t.getBoundingClientRect(), b = p.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const x = Math.round(Math.min(Math.max(a.left + a.width / 2 - b.left, 0), b.width));
    const y = a.top + a.height / 2 > b.top + b.height / 2 ? "100%" : "0%";
    p.style.setProperty("--m-origin", `${x}px ${y}`);
  }, [open, triggerRef, popupRef]);
}
