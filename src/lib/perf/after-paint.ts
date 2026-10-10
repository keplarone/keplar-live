/**
 * Run `fn` once the page has painted and gone idle: after window `load`, then `requestIdleCallback` (bounded by `timeout`),
 * or at the first real interaction (pointer, key, scroll, touch), whichever comes first. Heavy optional work (the three.js scene,
 * analytics extras) waits for this so it never competes with the first paint, LCP or the first input. Returns a cancel function.
 */
export function afterPaint(fn: () => void, { timeout = 2500, minDelay = 0 }: { timeout?: number; minDelay?: number } = {}): () => void {
  if (typeof window === "undefined") return () => {};
  let done = false;
  let idle = 0;
  let timer = 0;
  const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  const cleanup = () => {
    events.forEach((e) => window.removeEventListener(e, go));
    window.removeEventListener("load", onLoad);
    if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
    if (timer) window.clearTimeout(timer);
  };
  function go() {
    if (done) return;
    done = true;
    cleanup();
    fn();
  }
  function schedule() {
    if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout });
    else timer = window.setTimeout(go, Math.min(timeout, 1200));
  }
  function onLoad() {
    if (minDelay > 0) timer = window.setTimeout(schedule, minDelay);
    else schedule();
  }
  events.forEach((e) => window.addEventListener(e, go, { passive: true, once: true }));
  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
  return () => { done = true; cleanup(); };
}
