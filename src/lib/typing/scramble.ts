/** Letter-scramble reveal (pure): which characters of `final` are settled at progress p (0..1), the rest show a stand-in. */
const POOL = "abcdefghijklmnopqrstuvwxyz";
export function scrambleAt(final: string, p: number, seed = 0): { ch: string; settled: boolean }[] {
  const n = final.length;
  return Array.from(final).map((c, i) => {
    if (c === " " || c === "." || c === ",") return { ch: c, settled: true };
    // each letter settles at its own time, left to right with a little jitter
    const at = (i / Math.max(1, n)) * 0.7 + ((Math.sin((i + 1) * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * 0.18;
    if (p >= at + 0.12) return { ch: c, settled: true };
    const k = Math.floor(((Math.sin((i + 3) * 78.233 + seed + Math.floor(p * 60)) * 43758.5453) % 1 + 1) % 1 * POOL.length);
    const r = POOL[k];
    return { ch: c === c.toUpperCase() && c !== c.toLowerCase() ? r.toUpperCase() : r, settled: false };
  });
}

export type ScrambleClock = {
  now: () => number;
  raf: (cb: (t: number) => void) => unknown;
  caf: (h: unknown) => void;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
};

const browserClock = (): ScrambleClock => ({
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (h) => cancelAnimationFrame(h as number),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
});

/**
 * Drive one scramble run: `onFrame(p)` with p in 0..1 on animation frames, then `onDone()` exactly once.
 * Guarantees the run ENDS even when frames never come (background tab, throttled RAF): a timeout at
 * `duration + slack` forces the final frame (p = 1) and onDone. `cancel()` stops everything without calling
 * onFrame/onDone again; the caller is then responsible for showing the final text (see `settleNow`).
 * `delay` shifts the start (per-line stagger); total length is delay + duration.
 */
export function runScramble(
  opts: { duration: number; delay?: number; slack?: number; onFrame: (p: number) => void; onDone: () => void },
  clock: ScrambleClock = browserClock(),
): () => void {
  const { duration, delay = 0, slack = 250, onFrame, onDone } = opts;
  const t0 = clock.now();
  let raf: unknown = null;
  let timer: unknown = null;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    if (raf !== null) clock.caf(raf);
    if (timer !== null) clock.clearTimeout(timer);
    raf = timer = null;
    onFrame(1);
    onDone();
  };
  const tick = (now: number) => {
    if (ended) return;
    const p = Math.min(1, Math.max(0, (now - t0 - delay) / duration));
    if (p >= 1) return finish();
    onFrame(p);
    raf = clock.raf(tick);
  };
  timer = clock.setTimeout(finish, delay + duration + slack);
  raf = clock.raf(tick);
  return () => {
    if (ended) return;
    ended = true;
    if (raf !== null) clock.caf(raf);
    if (timer !== null) clock.clearTimeout(timer);
    raf = timer = null;
  };
}
