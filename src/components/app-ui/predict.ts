/**
 * Predictive preloading for the app's studios (Create, Slides, Study), on this browser only.
 *
 * What it learns: which view the person tends to open after which ("thread" -> "create"), as counts in localStorage. View names
 * only: no chats, prompts, account ids or timing, and nothing leaves the browser. What it does with it: after a view change, when
 * the browser is idle, it downloads the code for the most likely next studio so opening it is instant. It never runs anything,
 * calls a model, or changes what the person sees. Off when the browser asks to save data, or with the switch in
 * /account#personalization (turning it off also forgets what it learned). Its own precision (preloads later opened) is measured.
 */
const KEY = "keplar-predict-v1";
const OFF_KEY = "keplar-predict-off";
const VIEW = /^[a-z-]{1,24}$/;
/** A transition table row is halved once it holds this many observations, so old habits fade. */
const DECAY_AT = 40;

type Model = { t: Record<string, Record<string, number>>; made: number; used: number; last: string[] };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStore = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const empty = (): Model => ({ t: {}, made: 0, used: 0, last: [] });

function load(s: Store | null): Model {
  try {
    const raw = s?.getItem(KEY);
    const m = raw ? (JSON.parse(raw) as Model) : null;
    return m && typeof m === "object" && m.t ? { ...empty(), ...m } : empty();
  } catch {
    return empty();
  }
}
const save = (s: Store | null, m: Model) => { try { s?.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } };

export function predictionOn(s: Store | null = browserStore(), nav: { connection?: { saveData?: boolean } } | undefined = typeof navigator === "undefined" ? undefined : (navigator as never)): boolean {
  if (nav?.connection?.saveData) return false;
  try {
    return s?.getItem(OFF_KEY) !== "1";
  } catch {
    return false;
  }
}

/** The switch in account settings. Turning it off forgets everything learned. */
export function setPredictionOn(on: boolean, s: Store | null = browserStore()): void {
  try {
    if (on) s?.removeItem(OFF_KEY);
    else { s?.setItem(OFF_KEY, "1"); s?.removeItem(KEY); }
  } catch { /* blocked storage: nothing was learned either */ }
}

/** The person moved from one view to another. Also scores the last preload (was the view it guessed opened next?). */
export function recordTransition(from: string, to: string, s: Store | null = browserStore()): void {
  if (!predictionOn(s) || from === to || !VIEW.test(from) || !VIEW.test(to)) return;
  const m = load(s);
  if (m.last.length) { if (m.last.includes(to)) m.used++; m.last = []; }
  const row = (m.t[from] ??= {});
  row[to] = (row[to] ?? 0) + 1;
  if (Object.values(row).reduce((a, b) => a + b, 0) >= DECAY_AT) for (const k of Object.keys(row)) { row[k] = Math.floor(row[k] / 2); if (!row[k]) delete row[k]; }
  save(s, m);
}

/**
 * The likeliest next views from `from`, best first. Default: seen at least twice and at least a quarter of the time. `strict` (used on the
 * Ask page, which deliberately stays light): only a strong habit, seen at least 3 times and at least half the time.
 */
export function predictNext(from: string, k = 2, s: Store | null = browserStore(), strict = false): string[] {
  if (!predictionOn(s)) return [];
  const row = load(s).t[from] ?? {};
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  const [minN, minShare] = strict ? [3, 0.5] : [2, 0.25];
  return Object.entries(row).filter(([, n]) => n >= minN && n / total >= minShare).sort((a, b) => b[1] - a[1]).slice(0, k).map(([v]) => v);
}

/** Note what was preloaded, so the next transition can say whether it was used. */
export function notePreloaded(views: string[], s: Store | null = browserStore()): void {
  if (!views.length || !predictionOn(s)) return;
  const m = load(s);
  m.made += views.length;
  m.last = views.filter((v) => VIEW.test(v)).slice(0, 3);
  save(s, m);
}

/** Measured on this browser: how many preloads were made, and how many were for the view opened next. */
export function predictionStats(s: Store | null = browserStore()): { made: number; used: number; precision: number | null } {
  const m = load(s);
  return { made: m.made, used: m.used, precision: m.made ? m.used / m.made : null };
}
