/**
 * Pure logic for the Keplar Studio panels (auto top-up, Roblox Cloud, Blender Cloud, saved sessions). Ported unchanged in
 * behaviour from StudioTopUp.tsx, RobloxCloud.tsx and BlenderCloud.tsx; the wording that carries legal or billing meaning
 * (the top-up consent and monthly maximum) is kept word for word. Unit tested in tests/studio-panels.test.ts.
 */
import { SAVE_PREFIX, SAVE_VERSION } from "../../saved-session";
import type { BadgeProps } from "../../ui";

type Tone = NonNullable<BadgeProps["tone"]>;

export const money = (usd: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/* ── Auto top-up (/api/billing/studio-topup) ─────────────────────────────────────────────────────────────────────── */

export const TOPUP_ENDPOINT = "/api/billing/studio-topup";
export type TopUpChoice = { credits: number; priceUsd: number; monthlyLimit: number; methodLabel: string };
export type TopUpState = { enabled: boolean; choice: TopUpChoice | null };
export type TopUpOffer = { pack: string; label: string; credits: number; priceUsd: number; validDays: number };
export type TopUpQuote = {
  quoteId: string;
  offers: TopUpOffer[];
  methods: { id: string; label: string }[];
  custom?: { creditsPerUsd: number; minUsd: number; maxUsd: number } | null;
};
export const TOPUP_LIMITS = [1, 3, 5, 10] as const;

/** On / Off / Unavailable / Loading…, as the old summary said it. */
export function topUpStatus(state: TopUpState | null, error: string): { label: string; tone: Tone } {
  if (state) return state.enabled ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" };
  return error ? { label: "Unavailable", tone: "warning" } : { label: "Loading…", tone: "neutral" };
}

/** The offer the form describes: the picked pack, and for a custom amount only once the quote matches the typed amount. */
export function chosenOffer(quote: TopUpQuote | null, pack: string, amount: string): TopUpOffer | undefined {
  return quote?.offers.find((p) => p.pack === pack && (pack !== "custom" || p.priceUsd === Number(amount)));
}

export function offerLabel(p: TopUpOffer): string {
  return p.pack === "custom" ? "Custom dollar amount" : `${p.credits.toLocaleString()} credits · ${money(p.priceUsd)} USD`;
}

/** What is on now (shown while enabled). */
export function topUpSummary(c: TopUpChoice): string {
  return `${c.credits.toLocaleString()} credits per top-up at ${money(c.priceUsd)} USD, plus applicable tax and Whop fees, using ${c.methodLabel}. Up to ${c.monthlyLimit} top-up${c.monthlyLimit === 1 ? "" : "s"} per calendar month (UTC). You can turn this off at any time.`;
}

export function topUpMonthly(c: TopUpOffer, limit: number): string {
  return `At this setting: up to ${money(c.priceUsd * limit)} USD in top-ups per calendar month (UTC), plus applicable tax and Whop fees. Credits expire after ${c.validDays} days. Turning this off stops future charges; a payment already started can still complete.`;
}

/** The explicit authorization the person ticks. Word for word from the original flow. */
export function topUpConsent(c: TopUpOffer, limit: number): string {
  return `I authorize Keplar to charge my selected saved card ${money(c.priceUsd)} USD, plus applicable tax and Whop fees, for ${c.credits.toLocaleString()} credits whenever Studio needs more credits, up to ${limit} time${limit === 1 ? "" : "s"} per month, until I turn this off.`;
}

/** Enable is possible only with explicit consent, a matched offer and a card, and nothing in flight. */
export const canEnableTopUp = (f: { consent: boolean; chosen: unknown; method: string; busy: boolean }) => f.consent && !!f.chosen && !!f.method && !f.busy;

/* ── Shared job helpers ─────────────────────────────────────────────────────────────────────────────────────────── */

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const hoursLabel = (h: number) => `${h} ${plural(h, "hour")}`;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Keplar answered ${res.status}.`);
  return data;
}

/* ── Roblox Cloud ───────────────────────────────────────────────────────────────────────────────────────────────── */

export type RobloxJob = {
  id: string; place: { name: string }; goal: string; mode: string; maxUnits: number; maxMinutes: number; status: string; stopReason: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; scriptCount: number;
  plan: { title: string; status: string }[]; log: { at: string; kind: string; text: string }[];
  usage: { turns: number; units: number }; baseline: { problems: number; unchecked: number } | null;
  report: {
    summary: string; done: string[]; unresolved: string[]; testing: string[];
    files: { path: string; status: string; plus: number; minus: number }[];
    checks: { before: number; after: number; unchecked: number };
  } | null;
};

export const ROBLOX_STATUS: Record<string, string> = { draft: "Uploading", queued: "Starting", running: "Working", paused: "Paused", done: "Finished", stopped: "Stopped", blocked: "Needs you", failed: "Failed" };
export const ROBLOX_MODES = [
  { id: "until_done", label: "Until the goal is done" },
  { id: "time", label: "For a set time" },
  { id: "checkpoint", label: "First step only, then wait for me" },
] as const;
export const ROBLOX_HOURS = [1, 2, 4, 8, 12] as const;
export const ROBLOX_BUDGET = { min: 300, max: 20000, step: 100, initial: 3000 } as const;
export const GOAL_MIN = 8;
export const robloxActive = (j: Pick<RobloxJob, "status">) => j.status === "queued" || j.status === "running" || j.status === "draft";

export function robloxChecks(j: RobloxJob): string {
  const r = j.report;
  if (!r) return "";
  return `Luau check: ${r.checks.before} ${plural(r.checks.before, "problem")} before, ${r.checks.after} after${r.checks.unchecked ? ` · ${r.checks.unchecked} large scripts not checked in the cloud` : ""} · ${r.files.length} ${plural(r.files.length, "script")} changed · ${j.usage.turns} turns`;
}

/** Edits and new scripts are picked by default; deletions only when the person ticks them. */
export function defaultPicked(changes: { path: string; status: string; applied: boolean }[]): Set<string> {
  return new Set(changes.filter((c) => !c.applied && c.status !== "deleted").map((c) => c.path));
}

/* ── Blender Cloud ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type BlenderReport = {
  file: string; blender: string; engine: string; frameStart: number; frameEnd: number; frameCurrent: number; fps: number;
  resX: number; resY: number; resPercent: number; samples: number | null; objects: number; missing: string[]; warnings: string[];
};
export type RenderSettings = { engine: string; frameStart: number; frameEnd: number; frameStep: number; resPercent: number; samples?: number; format: string; video: boolean };
export type BlenderJob = {
  id: string; file: string; report: BlenderReport; settings: RenderSettings; maxUnits: number; maxMinutes: number; status: string; stopReason: string | null; createdAt: string; expiresAt: string;
  frames: { total: number; done: number; current: { frame: number; progress: string } | null; secondsPerFrame: number | null };
  usage: { units: number; machineMinutes: number }; outputs: { name: string; bytes: number }[]; machine: { vcpus: number; state: string } | null; downloadedAt: string | null;
  log: { at: string; kind: string; text: string }[];
};
export type BlenderOverview = { jobs: BlenderJob[]; capacity: { open: boolean; minutesLeft: number; busy: boolean }; machine: { vcpus: number; sessionMinutes: number; creditsPerMinute: number } };
export type RenderForm = RenderSettings & { range: "current" | "all" | "custom"; budget: number; hours: number };

export const BLENDER_STATUS: Record<string, string> = { uploading: "Uploading", queued: "Starting", rendering: "Rendering", paused: "Paused", done: "Finished", stopped: "Stopped", failed: "Failed" };
export const ENGINE: Record<string, string> = { CYCLES: "Cycles", BLENDER_EEVEE: "EEVEE", BLENDER_WORKBENCH: "Workbench" };
export const FORMATS = [{ id: "PNG", label: "PNG" }, { id: "JPEG", label: "JPEG" }, { id: "OPEN_EXR", label: "OpenEXR" }] as const;
export const BLENDER_HOURS = [1, 2, 4, 8, 12, 24] as const;
export const RENDER_BUDGET = { min: 100, max: 20000, step: 100, initial: 1500 } as const;
export const MAX_FRAMES = 2500;
export const INITIAL_FORM: RenderForm = { engine: "CYCLES", frameStart: 1, frameEnd: 1, frameStep: 1, resPercent: 100, format: "PNG", video: false, range: "current", budget: RENDER_BUDGET.initial, hours: 4 };
export const blenderActive = (j: Pick<BlenderJob, "status">) => j.status === "uploading" || j.status === "queued" || j.status === "rendering";
export const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);

/** The form seeded from what the add-on found in the scene. */
export function formFromReport(f: RenderForm, rep: BlenderReport): RenderForm {
  const engine = ENGINE[rep.engine] ? rep.engine : "CYCLES";
  return { ...f, engine, frameStart: rep.frameCurrent, frameEnd: rep.frameCurrent, frameStep: 1, resPercent: rep.resPercent, range: "current", video: false };
}

export function frameRange(f: RenderForm, rep: BlenderReport | null | undefined): { frameStart: number; frameEnd: number } {
  if (f.range === "current") return { frameStart: rep?.frameCurrent ?? 1, frameEnd: rep?.frameCurrent ?? 1 };
  if (f.range === "all") return { frameStart: rep?.frameStart ?? 1, frameEnd: rep?.frameEnd ?? 1 };
  return { frameStart: f.frameStart, frameEnd: f.frameEnd };
}

export function frameCount(f: RenderForm, rep: BlenderReport | null | undefined): number {
  const r = frameRange(f, rep);
  return Math.max(0, Math.floor((r.frameEnd - r.frameStart) / (f.range === "custom" ? Math.max(1, f.frameStep) : 1)) + 1);
}

/** The settings sent to the server: video only for more than one frame. */
export function renderSettings(f: RenderForm, rep: BlenderReport | null | undefined): RenderSettings {
  const count = frameCount(f, rep);
  return { engine: f.engine, ...frameRange(f, rep), frameStep: f.range === "custom" ? f.frameStep : 1, resPercent: f.resPercent, ...(f.samples ? { samples: f.samples } : {}), format: f.format, video: f.video && count > 1 };
}

export const canRender = (count: number, open: boolean) => count >= 1 && count <= MAX_FRAMES && open;
export const resolutionOptions = (rep: BlenderReport) => [...new Set([25, 50, 75, 100, 150, 200, rep.resPercent])].sort((a, b) => a - b);
export const canDownload = (j: BlenderJob) => j.frames.done > 0 && j.machine?.state !== "deleted" && j.status !== "uploading";
export const downloadLabel = (j: Pick<BlenderJob, "file" | "createdAt">) => `${j.file.replace(/\.blend$/i, "")} ${j.createdAt.slice(0, 16).replace("T", " ").replace(":", ".")}`;
export function missingText(missing: string[]): string {
  return `Missing on this computer, so they'll render pink: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}.`;
}
export const capacityText = (cap: { busy: boolean }) => (cap.busy ? "Every render machine is busy right now. Try again in a few minutes." : "Cloud rendering has used this month's machine time. It opens again next month.");

/** Badge tone for a job status (both clouds). Colour is never the only signal: the badge always carries the label. */
export function jobTone(status: string): Tone {
  switch (status) {
    case "running": case "rendering": case "queued": case "draft": case "uploading": return "accent";
    case "done": return "success";
    case "blocked": return "warning";
    case "failed": return "danger";
    default: return "neutral";
  }
}

/* ── Saved sessions (saved-session.ts, /api/studio/chats) ───────────────────────────────────────────────────────── */

export type SessionEnv = "roblox" | "blender";
export type SessionEntry = {
  key: string;
  name: string;
  /** Newest save among the copies. */
  savedAt: number;
  device: { savedAt: number; items: number; units: number } | null;
  account: { savedAt: number } | null;
};

/** Blender chats are keyed by the .blend file (useStudioAgent blenderPlace: "name:blender/<file>"). */
export const envOfKey = (key: string): SessionEnv => (key.startsWith(`${SAVE_PREFIX}name:blender/`) ? "blender" : "roblox");

type StorageLike = { length: number; key(i: number): string | null; getItem(k: string): string | null };

/** This device's saved chats for one environment. Malformed entries are skipped; storage errors give an empty list. */
export function deviceSessions(storage: StorageLike | null | undefined, env: SessionEnv): SessionEntry[] {
  const out: SessionEntry[] = [];
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(SAVE_PREFIX) || envOfKey(key) !== env) continue;
      try {
        const s = JSON.parse(storage.getItem(key) ?? "null") as { v?: number; savedAt?: number; name?: string; items?: unknown[]; units?: number } | null;
        if (!s || s.v !== SAVE_VERSION || !Array.isArray(s.items) || typeof s.savedAt !== "number") continue;
        out.push({ key, name: s.name || nameFromKey(key), savedAt: s.savedAt, device: { savedAt: s.savedAt, items: s.items.length, units: s.units ?? 0 }, account: null });
      } catch { /* one bad entry */ }
    }
  } catch { /* storage blocked */ }
  return out;
}

/** A readable name when a save carries none: the place name or file the key was made from. */
export function nameFromKey(key: string): string {
  const rest = key.slice(SAVE_PREFIX.length);
  if (rest.startsWith("name:blender/")) return rest.slice("name:blender/".length);
  if (rest.startsWith("name:")) return rest.slice(5);
  if (rest.startsWith("id:")) return `Place ${rest.slice(3)}`;
  return rest;
}

/** Device and account copies merged by key, newest first. */
export function mergeSessions(device: SessionEntry[], account: { key: string; name: string; savedAt: number }[], env: SessionEnv): SessionEntry[] {
  const map = new Map<string, SessionEntry>();
  for (const d of device) map.set(d.key, { ...d });
  for (const r of account) {
    if (!r.key.startsWith(SAVE_PREFIX) || envOfKey(r.key) !== env) continue;
    const had = map.get(r.key);
    if (had) map.set(r.key, { ...had, savedAt: Math.max(had.savedAt, r.savedAt), account: { savedAt: r.savedAt } });
    else map.set(r.key, { key: r.key, name: r.name || nameFromKey(r.key), savedAt: r.savedAt, device: null, account: { savedAt: r.savedAt } });
  }
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** The account holds a newer save of this place than this device (another computer kept working). */
export const accountIsNewer = (e: SessionEntry | undefined) => !!e?.account && e.account.savedAt > (e.device?.savedAt ?? 0);

export function whereSaved(e: SessionEntry): string {
  return e.device && e.account ? "This device and account" : e.device ? "This device" : "Account";
}

export function savedWhen(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const d = new Date(ms);
  if (now - ms < 86_400_000 && new Date(now).getDate() === d.getDate()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
