import { flushSync } from "react-dom";

/**
 * In-app view switches (the /app tabs swap views inside one mounted shell with pushState, not a Next navigation, so React's
 * route <ViewTransition> never sees them). Runs `update` inside document.startViewTransition so the view area fades and rises
 * (styles: src/styles/motion.css, :root[data-vt="view"]). Browsers without the API, reduced motion and hidden tabs just run
 * the update. The update is applied synchronously inside the transition callback with flushSync, so the new snapshot is the
 * new view.
 */
type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

let running = false;

export function withViewTransition(update: () => void, kind = "view"): void {
  const doc = typeof document === "undefined" ? null : (document as VTDocument);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc || typeof doc.startViewTransition !== "function" || reduce || doc.visibilityState !== "visible" || running) {
    update();
    return;
  }
  running = true;
  const root = doc.documentElement;
  root.dataset.vt = kind;
  try {
    const t = doc.startViewTransition(() => flushSync(update));
    void t.finished.catch(() => undefined).finally(() => {
      running = false;
      if (root.dataset.vt === kind) delete root.dataset.vt;
    });
  } catch {
    running = false;
    delete root.dataset.vt;
    update();
  }
}
