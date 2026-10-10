/**
 * Overlay presence: the shared enter/exit pattern for dialogs, menus, popovers, sheets and toasts (styles in src/styles/motion.css).
 *
 * An overlay is "open", "closing" (still mounted, playing its exit animation) or "closed" (unmounted). The element carries
 * data-state="open" | "closed" and a data-motion variant; CSS plays the enter keyframes on mount and the exit keyframes when
 * data-state flips to "closed". The element unmounts when its own exit animation ends, or after a fallback timeout if no
 * animationend ever arrives (reduced motion, display:none, a tab in the background, an unsupported browser), so nothing can
 * get stuck open. Framework-free on purpose: the React hooks in src/components/motion/usePresence.ts drive these functions, and
 * tests/motion.test.ts checks them directly.
 */

export type PresencePhase = "open" | "closing" | "closed";
export type PresenceEvent = "open" | "close" | "animationend" | "timeout";

/** Exit keyframes last --m-dur-1 (120ms) to --m-dur-2 (180ms); the fallback waits a little longer than the slowest one. */
export const EXIT_FALLBACK_MS = 260;

export function presenceStep(phase: PresencePhase, ev: PresenceEvent): PresencePhase {
  switch (ev) {
    case "open":
      return "open";
    case "close":
      return phase === "closed" ? "closed" : "closing";
    case "animationend":
    case "timeout":
      // Only a closing overlay finishes. The enter animation's own animationend must not unmount an open one.
      return phase === "closing" ? "closed" : phase;
  }
}

/** The phase a render should use, given the phase it last committed and whether the owner wants it open now. */
export function phaseFor(prev: PresencePhase, open: boolean): PresencePhase {
  if (open) return "open";
  return prev === "open" ? presenceStep(prev, "close") : prev;
}

export const isMounted = (p: PresencePhase): boolean => p !== "closed";
export const dataState = (p: PresencePhase): "open" | "closed" => (p === "open" ? "open" : "closed");

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reduced motion collapses exits to instant: no wait at all. */
export function exitFallbackMs(reduced = prefersReducedMotion(), ms = EXIT_FALLBACK_MS): number {
  return reduced ? 0 : ms;
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/**
 * Imperative controller with the same rules (for non-React callers and tests): open(), close(), animationEnd(target, current).
 * onChange fires with every new phase; "closed" is the moment to unmount.
 */
export function createPresence(opts: { open?: boolean; onChange?: (p: PresencePhase) => void; fallbackMs?: number; reduced?: boolean; timers?: Timers } = {}) {
  const timers = opts.timers ?? realTimers;
  let phase: PresencePhase = opts.open ? "open" : "closed";
  let timer: unknown = null;
  const clear = () => { if (timer !== null) timers.clear(timer); timer = null; };
  const go = (ev: PresenceEvent) => {
    const next = presenceStep(phase, ev);
    if (next === phase) return;
    phase = next;
    if (phase !== "closing") clear();
    opts.onChange?.(phase);
  };
  return {
    get phase() { return phase; },
    get mounted() { return isMounted(phase); },
    open() { go("open"); },
    close() {
      if (phase !== "open") return;
      go("close");
      const ms = exitFallbackMs(opts.reduced ?? prefersReducedMotion(), opts.fallbackMs);
      if (ms === 0) { go("timeout"); return; }
      timer = timers.set(() => { timer = null; go("timeout"); }, ms);
    },
    /** Pass the event's target and currentTarget: a child's animation bubbling up must not end the overlay's exit. */
    animationEnd(target?: unknown, current?: unknown) {
      if (target !== undefined && current !== undefined && target !== current) return;
      go("animationend");
    },
    dispose: clear,
  };
}
