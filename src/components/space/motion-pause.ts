/*
 * Pause for the Space site's continuous motion (WCAG 2.2.2): the cycling headline word, the aura that follows it, the "YOU"
 * gradient, the scroll cue and the star flight. One switch for all of them (MotionToggle in SpaceChrome.tsx); the choice is
 * remembered in this browser (best effort). <html data-space-paused> lets the CSS loops stop too; the star field listens for
 * the "space:motion" event. A plain module (no React) so the motion toggle can read it without importing the chrome.
 */
export const PAUSE_KEY = "space-motion-paused";
let paused = false;
const listeners = new Set<() => void>();

export const isMotionPaused = () => paused;

export function setMotionPaused(v: boolean) {
  paused = v;
  document.documentElement.toggleAttribute("data-space-paused", v);
  try {
    if (v) localStorage.setItem(PAUSE_KEY, "1");
    else localStorage.removeItem(PAUSE_KEY);
  } catch {
    /* storage blocked: still pauses for this visit */
  }
  listeners.forEach((l) => l());
  window.dispatchEvent(new CustomEvent("space:motion", { detail: { paused: v } }));
}

export function subscribePause(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
