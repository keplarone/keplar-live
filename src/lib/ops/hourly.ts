/**
 * Per-provider and per-model hourly limits (spend and call count), a second line of defence under the daily cap and the
 * spike detector: one runaway model or provider cannot burn the whole day's budget in an hour.
 * Counters live in the shared store (system_hourly_use, one row per provider/model per UTC hour) and are read through a short
 * in-memory cache. When a limit is hit the call is refused as rate-limited, so the router falls back to another model.
 *
 * Defaults (env KEPLAR_PROVIDER_HOURLY_USD, KEPLAR_MODEL_HOURLY_USD, KEPLAR_MODEL_HOURLY_CALLS), per-id overrides in
 * KEPLAR_HOURLY_LIMITS='{"openrouter":{"usd":10},"some-model-id":{"usd":2,"calls":200}}'.
 */
import { collection } from "@/lib/create/platform/store";
import { opsControls, type HourlyOverride } from "./controls";

export type Use = { usd: number; calls: number };
export type HourlyLimits = { providerUsd: number; modelUsd: number; modelCalls: number; overrides: Record<string, { usd?: number; calls?: number }> };

export function hourlyLimits(env: Record<string, string | undefined> = process.env): HourlyLimits {
  const n = (k: string, d: number) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);
  let overrides: HourlyLimits["overrides"] = {};
  try {
    const raw = env.KEPLAR_HOURLY_LIMITS ? (JSON.parse(env.KEPLAR_HOURLY_LIMITS) as unknown) : {};
    if (raw && typeof raw === "object") overrides = raw as HourlyLimits["overrides"];
  } catch {
    overrides = {}; // a malformed override never disables the defaults
  }
  return { providerUsd: n("KEPLAR_PROVIDER_HOURLY_USD", 15), modelUsd: n("KEPLAR_MODEL_HOURLY_USD", 8), modelCalls: n("KEPLAR_MODEL_HOURLY_CALLS", 3000), overrides };
}

/** Environment defaults, then the admin-edited values on top (admin wins; overrides are merged per id). */
export function effectiveLimits(base: HourlyLimits, edit?: HourlyOverride): HourlyLimits {
  if (!edit) return base;
  const overrides: HourlyLimits["overrides"] = { ...base.overrides };
  for (const [k, v] of Object.entries(edit.overrides ?? {})) overrides[k] = { ...overrides[k], ...v };
  return { providerUsd: edit.providerUsd ?? base.providerUsd, modelUsd: edit.modelUsd ?? base.modelUsd, modelCalls: edit.modelCalls ?? base.modelCalls, overrides };
}

/** The limits in force right now (env + admin edits). A controls read failure falls back to the env defaults. */
export async function currentLimits(): Promise<HourlyLimits> {
  const base = hourlyLimits();
  try {
    return effectiveLimits(base, (await opsControls()).hourly);
  } catch {
    return base;
  }
}

export const hourKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 13); // 2026-10-02T16

/** Pure: null when there is room, otherwise the reason (never includes secrets). */
export function hourlyBlock(limits: HourlyLimits, provider: string, model: string, use: { provider: Use; model: Use }): string | null {
  const po = limits.overrides[provider];
  const mo = limits.overrides[model];
  const pUsd = po?.usd ?? limits.providerUsd;
  const mUsd = mo?.usd ?? limits.modelUsd;
  const mCalls = mo?.calls ?? limits.modelCalls;
  if (use.provider.usd >= pUsd) return `Hourly spend limit for this provider reached ($${pUsd}/hour). Not sent.`;
  if (use.model.usd >= mUsd) return `Hourly spend limit for this model reached ($${mUsd}/hour). Not sent.`;
  if (use.model.calls >= mCalls) return `Hourly request limit for this model reached (${mCalls}/hour). Not sent.`;
  return null;
}

type Row = { id: string; workspaceId: string; usd: number; calls: number };
const rows = () => collection<Row>("system_hourly_use");
const SYSTEM = "system";
const idOf = (kind: "p" | "m", name: string, t = Date.now()) => `${kind}:${name}:${hourKey(t)}`;

const cache = new Map<string, { at: number; use: Use }>();
const TTL = 5_000;

async function read(id: string): Promise<Use> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.use;
  const row = await rows().get(SYSTEM, id).catch(() => null);
  const use = { usd: row?.usd ?? 0, calls: row?.calls ?? 0 };
  cache.set(id, { at: Date.now(), use });
  return use;
}

/** Reason string when this provider/model is over its hour, else null. A store error never blocks a call (fails open). */
export async function hourlyBlockFor(provider: string, model: string): Promise<string | null> {
  try {
    const [p, m] = await Promise.all([read(idOf("p", provider)), read(idOf("m", model))]);
    return hourlyBlock(await currentLimits(), provider, model, { provider: p, model: m });
  } catch {
    return null;
  }
}

/** Count one finished call (fire and forget). Also bumps the local cache so the next check on this instance sees it at once. */
export function recordHourly(provider: string, model: string, usd: number): void {
  const add = Number.isFinite(usd) && usd > 0 ? usd : 0;
  for (const [kind, name] of [["p", provider], ["m", model]] as const) {
    const id = idOf(kind, name);
    const hit = cache.get(id);
    if (hit) cache.set(id, { at: hit.at, use: { usd: hit.use.usd + add, calls: hit.use.calls + 1 } });
    rows()
      .increment(SYSTEM, id, { usd: add, calls: 1 }, { id, workspaceId: SYSTEM, usd: 0, calls: 0 })
      .catch(() => undefined);
  }
}

/** For /admin: this hour's counters for the busiest providers/models. */
export async function hourlyUsage(limit = 12): Promise<{ id: string; kind: "provider" | "model"; name: string; usd: number; calls: number }[]> {
  const prefix = hourKey();
  const all = await rows().listSystem((r) => r.id.endsWith(`:${prefix}`)).catch(() => [] as Row[]);
  return all
    .map((r) => ({ id: r.id, kind: (r.id.startsWith("p:") ? "provider" : "model") as "provider" | "model", name: r.id.slice(2, r.id.length - prefix.length - 1), usd: r.usd, calls: r.calls }))
    .sort((a, b) => b.usd - a.usd || b.calls - a.calls)
    .slice(0, limit);
}
