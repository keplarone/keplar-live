/**
 * Device preferences: the Settings options that live in this browser (not the account) — appearance, accessibility, chat
 * behaviour and notifications. One JSON object in localStorage under PREFS_KEY. PREFS_SCRIPT (root layout <head>) copies the
 * visual ones onto <html> as data attributes before first paint, so text size, font, contrast etc. never flash; CSS in
 * src/styles/prefs.css does the rest. Behaviour prefs (send key, follow stream, notifications) are read where they act.
 */
export const PREFS_KEY = "keplar-prefs-v1";
export const PREFS_EVENT = "keplar-prefs";

export const PREF_DEFAULTS = {
  textSize: "md" as "sm" | "md" | "lg" | "xl",
  font: "default" as "default" | "serif" | "readable",
  chatWidth: "default" as "default" | "wide" | "full",
  codeWrap: false,
  reduceMotion: false,
  contrast: false,
  underlineLinks: false,
  focusRings: false,
  sendKey: "enter" as "enter" | "mod-enter",
  followStream: true,
  spellcheck: true,
  notifyDone: false,
  soundDone: false,
};
export type Prefs = typeof PREF_DEFAULTS;
export type PrefKey = keyof Prefs;

/** Prefs mirrored onto <html data-pref-*>; only non-default values are written. */
const ATTRS: PrefKey[] = ["textSize", "font", "chatWidth", "codeWrap", "reduceMotion", "contrast", "underlineLinks", "focusRings"];
const attrName = (k: string) => `data-pref-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

function sanitize(raw: unknown): Prefs {
  const out = { ...PREF_DEFAULTS } as Record<string, unknown>;
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k in PREF_DEFAULTS && typeof v === typeof (PREF_DEFAULTS as Record<string, unknown>)[k]) out[k] = v;
    }
  }
  return out as Prefs;
}

let cache: Prefs | null = null;
let cacheRaw: string | null = null;

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return PREF_DEFAULTS;
  let raw: string | null = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch { /* storage blocked: defaults */ }
  if (cache && raw === cacheRaw) return cache;
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* corrupt: defaults */ }
  cache = sanitize(parsed);
  cacheRaw = raw;
  return cache;
}

export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement) {
  for (const k of ATTRS) {
    const v = p[k];
    if (v === PREF_DEFAULTS[k]) root.removeAttribute(attrName(k));
    else root.setAttribute(attrName(k), String(v));
  }
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...readPrefs(), ...patch };
  const diff = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== PREF_DEFAULTS[k as PrefKey]));
  try {
    if (Object.keys(diff).length) localStorage.setItem(PREFS_KEY, JSON.stringify(diff));
    else localStorage.removeItem(PREFS_KEY);
  } catch { /* storage blocked: applies for this page only */ cache = next; cacheRaw = null; }
  applyPrefs(next);
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export const resetPrefs = () => setPrefs({ ...PREF_DEFAULTS });

/** Runs in <head> before paint. Dependency-free and exception-safe. */
export const PREFS_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}"),r=document.documentElement,a=${JSON.stringify(ATTRS)};for(var i=0;i<a.length;i++){var k=a[i],v=p[k];if(v!==undefined&&v!==null&&v!==false)r.setAttribute("data-pref-"+k.replace(/[A-Z]/g,function(c){return"-"+c.toLowerCase()}),String(v))}}catch(e){}})();`;

/** A short chime for "answer finished" (Settings → Notifications). WebAudio, no file to download. */
export function playDoneSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.4);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch { /* audio blocked */ }
}
