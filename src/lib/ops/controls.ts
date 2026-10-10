/**
 * Operator controls (kill switches). One shared row in the store, read on every spend path:
 *
 *  - globalStop        no model call, no media, no agent step: everything that costs money stops (free chat too)
 *  - pauseMedia        image/video generation paused
 *  - pauseAgents       agent runs and schedules paused
 *  - disabledProviders route providers ("openrouter", "direct:openai", ...) or model vendors ("openai", "anthropic") switched off
 *  - disabledModels    individual model ids switched off (the router's fallbacks pick another model)
 *  - autoPauseUntil    set by the spike detector: media + Free paused until this time (ISO)
 *
 * KEPLAR_GLOBAL_STOP=1 is an environment-level hard stop that works even if the database is down.
 * The state is cached per instance for a few seconds (stale-while-revalidate) so it adds no latency to a request;
 * changing a switch clears the local cache and the other instances pick it up within CACHE_MS.
 * If the store cannot be read, the last known state is used (never "everything open" after a hiccup that follows a stop).
 */
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";

/** Admin-edited hourly limits. Missing fields fall back to the environment defaults (src/lib/ops/hourly.ts). */
export type HourlyOverride = { providerUsd?: number; modelUsd?: number; modelCalls?: number; overrides?: Record<string, { usd?: number; calls?: number }> };

export type OpsControls = {
  id: string;
  workspaceId: string;
  globalStop: boolean;
  pauseMedia: boolean;
  pauseAgents: boolean;
  /** Stops NEW seller checkouts instantly (existing orders, refunds and webhooks keep working). */
  pausePayments?: boolean;
  disabledProviders: string[];
  disabledModels: string[];
  autoPauseUntil: string | null;
  hourly?: HourlyOverride;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};

const SYSTEM = "system";
const KEY = "controls";
export const CACHE_MS = 5000;
const rows = () => collection<OpsControls>("ops_controls");

export const defaultControls = (): OpsControls => ({ id: KEY, workspaceId: SYSTEM, globalStop: false, pauseMedia: false, pauseAgents: false, pausePayments: false, disabledProviders: [], disabledModels: [], autoPauseUntil: null, reason: "", updatedAt: new Date(0).toISOString(), updatedBy: "" });

export class OpsStopError extends HttpError {
  constructor(message: string, code = "paused") {
    super(503, message, code);
  }
}

export const GLOBAL_STOP_MESSAGE = "Keplar is paused for maintenance. Nothing was charged. Please try again shortly.";

let cached: { at: number; value: OpsControls } | null = null;
let inflightLoad: Promise<OpsControls> | null = null;

async function load(): Promise<OpsControls> {
  try {
    const row = await rows().get(SYSTEM, KEY);
    const value = row ? { ...defaultControls(), ...row } : defaultControls();
    cached = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[ops] could not read controls:", e instanceof Error ? e.name : "error");
    if (cached) cached = { at: Date.now() - CACHE_MS / 2, value: cached.value }; // keep last known state, retry soon
    return cached?.value ?? defaultControls();
  }
}

/** Current controls. Fresh within CACHE_MS; otherwise the stale value is returned while a refresh runs. */
export async function opsControls(): Promise<OpsControls> {
  const env = process.env.KEPLAR_GLOBAL_STOP === "1";
  let c: OpsControls;
  if (!cached) {
    inflightLoad ??= load().finally(() => (inflightLoad = null));
    c = await inflightLoad;
  } else {
    c = cached.value;
    if (Date.now() - cached.at > CACHE_MS) {
      inflightLoad ??= load().finally(() => (inflightLoad = null));
      void inflightLoad.catch(() => undefined);
    }
  }
  return env ? { ...c, globalStop: true, reason: c.reason || "Environment stop (KEPLAR_GLOBAL_STOP)" } : c;
}

/** Fresh read, bypassing the cache (admin page, after changes). */
export async function opsControlsFresh(): Promise<OpsControls> {
  cached = null;
  return opsControls();
}

export type ControlsPatch = Partial<Pick<OpsControls, "globalStop" | "pauseMedia" | "pauseAgents" | "pausePayments" | "disabledProviders" | "disabledModels" | "autoPauseUntil" | "hourly" | "reason">>;

const list = (v: unknown, max = 50) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 120)).filter((x) => /^[a-z0-9._:/@+-]+$/.test(x)))].slice(0, max) : undefined);

/** Validates admin input for the hourly limits. Throws on junk; returns a clean object (empty = back to defaults). */
export function sanitizeHourly(v: unknown): HourlyOverride {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "Hourly limits must be an object.");
  const o = v as Record<string, unknown>;
  const num = (x: unknown, name: string, int = false) => {
    if (x === undefined || x === null || x === "") return undefined;
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || (int && !Number.isInteger(n))) throw new HttpError(400, `${name} must be a positive number${int ? " (whole)" : ""}.`);
    return int ? n : Math.round(n * 10_000) / 10_000;
  };
  const out: HourlyOverride = {};
  const pu = num(o.providerUsd, "Provider USD per hour");
  const mu = num(o.modelUsd, "Model USD per hour");
  const mc = num(o.modelCalls, "Model calls per hour", true);
  if (pu !== undefined) out.providerUsd = pu;
  if (mu !== undefined) out.modelUsd = mu;
  if (mc !== undefined) out.modelCalls = mc;
  if (o.overrides !== undefined && o.overrides !== null) {
    if (typeof o.overrides !== "object" || Array.isArray(o.overrides)) throw new HttpError(400, "Overrides must be an object keyed by provider or model id.");
    const ov: Record<string, { usd?: number; calls?: number }> = {};
    const entries = Object.entries(o.overrides as Record<string, unknown>);
    if (entries.length > 50) throw new HttpError(400, "At most 50 overrides.");
    for (const [k, val] of entries) {
      const key = k.trim().toLowerCase().slice(0, 120);
      if (!/^[a-z0-9._:/@+-]+$/.test(key)) throw new HttpError(400, `Invalid override name "${k.slice(0, 40)}".`);
      if (!val || typeof val !== "object") throw new HttpError(400, `Override for ${key} must be {usd, calls}.`);
      const e: { usd?: number; calls?: number } = {};
      const u = num((val as Record<string, unknown>).usd, `${key} USD`);
      const c = num((val as Record<string, unknown>).calls, `${key} calls`, true);
      if (u !== undefined) e.usd = u;
      if (c !== undefined) e.calls = c;
      if (u !== undefined || c !== undefined) ov[key] = e;
    }
    if (Object.keys(ov).length) out.overrides = ov;
  }
  return out;
}

export async function setControls(patch: ControlsPatch, actor: string): Promise<OpsControls> {
  const cur = await opsControlsFresh();
  const next: OpsControls = { ...cur, updatedAt: now(), updatedBy: actor };
  if (typeof patch.globalStop === "boolean") next.globalStop = patch.globalStop;
  if (typeof patch.pauseMedia === "boolean") next.pauseMedia = patch.pauseMedia;
  if (typeof patch.pauseAgents === "boolean") next.pauseAgents = patch.pauseAgents;
  if (typeof patch.pausePayments === "boolean") next.pausePayments = patch.pausePayments;
  const dp = list(patch.disabledProviders);
  if (dp) next.disabledProviders = dp;
  const dm = list(patch.disabledModels, 100);
  if (dm) next.disabledModels = dm;
  if (patch.autoPauseUntil !== undefined) next.autoPauseUntil = patch.autoPauseUntil;
  if (patch.hourly !== undefined) next.hourly = sanitizeHourly(patch.hourly);
  if (typeof patch.reason === "string") next.reason = patch.reason.slice(0, 300);
  if (await rows().get(SYSTEM, KEY)) await rows().update(SYSTEM, KEY, next);
  else await rows().insertIfAbsent(next);
  cached = { at: Date.now(), value: next };
  return next;
}

export const resetOpsCache = () => {
  cached = null;
  inflightLoad = null;
};

/* ── checks used on spend paths ─────────────────────────────────────────── */

export const autoPaused = (c: OpsControls, at = Date.now()) => Boolean(c.autoPauseUntil && Date.parse(c.autoPauseUntil) > at);

/** Throws when a global stop is on. Call before anything that costs money. */
export async function assertNotStopped(): Promise<OpsControls> {
  const c = await opsControls();
  if (c.globalStop) throw new OpsStopError(GLOBAL_STOP_MESSAGE, "global_stop");
  return c;
}

export type SpendKind = "text" | "media" | "agent";

/** Used by the shared spend gate (assertCanSpend): global stop, media pause, agent pause, spike auto-pause. */
export async function assertOpsAllows(kind: SpendKind): Promise<void> {
  const c = await assertNotStopped();
  if (kind === "media" && (c.pauseMedia || autoPaused(c))) throw new OpsStopError("Image and video generation is paused right now. Nothing was charged.", "media_paused");
  if (kind === "agent" && c.pauseAgents) throw new OpsStopError("Agent runs are paused right now. Nothing was charged.", "agents_paused");
}

/** True when this route provider or model (and its vendor) is switched off. */
export function isDisabled(c: Pick<OpsControls, "disabledProviders" | "disabledModels">, o: { provider?: string; vendor?: string; modelId?: string }): boolean {
  const p = o.provider?.toLowerCase();
  const v = o.vendor?.toLowerCase();
  const m = o.modelId?.toLowerCase();
  return Boolean((m && c.disabledModels.includes(m)) || (p && c.disabledProviders.includes(p)) || (v && c.disabledProviders.includes(v)));
}
