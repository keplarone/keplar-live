/**
 * Live catalog sync (server-only).
 *
 * `syncLiveCatalog()` pulls each provider's model list (free GETs):
 *   OpenRouter GET /api/v1/models, OpenAI GET /v1/models, NVIDIA GET /v1/models
 * and writes a snapshot to $KEPLAR_DATA_DIR/keplar/live-catalog-sync.json with,
 * for every live-roster model: which routes are still listed and the current
 * OpenRouter price. It also records cheap candidate models from families the
 * roster doesn't cover yet, for a human to review (never auto-added).
 *
 * `loadLiveCatalog()` applies the latest snapshot to the static roster:
 *   - routes no longer listed are dropped (a model with no route left is unroutable)
 *   - OpenRouter prices replace the seed prices
 *   - anything whose blended price rose above LIVE_MAX_BLENDED_USD_PER_M is unroutable
 * No snapshot → the static roster as verified on 2026-09-28.
 *
 * Free plan (`loadFreeCatalog()`): every FREE_SEEDS model must still be listed
 * with $0 prompt AND completion pricing, or it becomes unroutable. The snapshot
 * also records every other `:free` model listed at $0 (minus
 * FREE_FALLBACK_EXCLUDE); those are used only as fallbacks after the seeds.
 *
 * Modalities: every roster model, free seed and free extra also records
 * OpenRouter's `architecture.input_modalities`; the engine sends images and
 * video frames only to models whose list includes "image" (media.ts).
 *
 * Run it with `npm run catalog:sync` (scripts/catalog-sync.ts) or on a schedule.
 * API keys are sent as headers only and never written to the snapshot.
 */
import { readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/create/platform/store";
import { liveEnv } from "./config";
import { isZeroPriced } from "./free-guard";
import { FREE_FALLBACK_EXCLUDE, FREE_FALLBACK_ORDER, LIVE_MAX_BLENDED_USD_PER_M, freeRoster, liveRoster, syncedFreeSpec } from "./live-catalog";
import type { LiveRoute, ModelSpec } from "./types";

export type SyncSnapshot = {
  syncedAt: string;
  /** Route → whether its list was fetched (a failed fetch never drops routes). */
  fetched: Record<LiveRoute, boolean>;
  models: Record<string, { routes: Partial<Record<LiveRoute, boolean>>; openRouterPrice?: { inputPer1M: number; outputPer1M: number }; inputModalities?: string[] }>;
  candidates: { id: string; family: string; inputPer1M: number; outputPer1M: number }[];
  /** Free-plan seeds: still listed, and still $0 for prompt and completion. */
  free?: Record<string, { listed: boolean; zeroPriced: boolean; inputModalities?: string[] }>;
  /** Other `:free` models listed at $0 (fallback only, after the seeds). */
  freeExtras?: { id: string; contextWindow: number | null; inputModalities?: string[] }[];
  errors: string[];
};

export const snapshotPath = () => path.join(DATA_DIR, "keplar", "live-catalog-sync.json");

type OrModel = { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: unknown } };

/** OpenRouter `architecture.input_modalities` as a clean string list (undefined when absent). */
export function modalitiesOf(m?: OrModel): string[] | undefined {
  const raw = m?.architecture?.input_modalities;
  if (!Array.isArray(raw)) return undefined;
  const list = raw.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().slice(0, 20));
  return list.length ? [...new Set(list)] : undefined;
}

async function list(url: string, key: string | null, timeoutMs = 20_000): Promise<{ ids: Set<string>; raw: OrModel[] } | null> {
  const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { data?: OrModel[] } | null;
  if (!j?.data) return null;
  return { ids: new Set(j.data.map((m) => m.id)), raw: j.data };
}

export async function syncLiveCatalog(opts: { write?: boolean } = {}): Promise<SyncSnapshot> {
  const env = liveEnv();
  const errors: string[] = [];
  const [or, oa, nv] = await Promise.all([
    list(`${env.openRouterBase}/models`, env.openRouterKey),
    env.direct.openai ? list(`${env.openAiBase}/models`, env.direct.openai) : Promise.resolve(null),
    list(`${env.nvidiaBase}/models`, env.nvidiaKey),
  ]);
  if (!or) errors.push("OpenRouter model list unavailable");
  if (!oa) errors.push(env.direct.openai ? "OpenAI model list unavailable" : "No OPENAI_API_KEY; OpenAI route not checked");
  if (!nv) errors.push("NVIDIA model list unavailable");
  const lists: Record<LiveRoute, Set<string> | null> = { openrouter: or?.ids ?? null, openai: oa?.ids ?? null, nvidia: nv?.ids ?? null };
  const orById = new Map((or?.raw ?? []).map((m) => [m.id, m]));
  const per1M = (s?: string) => (s != null && Number.isFinite(Number(s)) ? Number(s) * 1e6 : null);

  const models: SyncSnapshot["models"] = {};
  for (const m of liveRoster) {
    const routes: Partial<Record<LiveRoute, boolean>> = {};
    for (const [route, id] of Object.entries(m.routes ?? {}) as [LiveRoute, string][]) {
      const l = lists[route];
      if (l) routes[route] = l.has(id);
    }
    const orId = m.routes?.openrouter;
    const p = orId ? orById.get(orId)?.pricing : undefined;
    const inP = per1M(p?.prompt);
    const outP = per1M(p?.completion);
    const inputModalities = orId ? modalitiesOf(orById.get(orId)) : undefined;
    models[m.id] = { routes, ...(inP != null && outP != null ? { openRouterPrice: { inputPer1M: +inP.toFixed(4), outputPer1M: +outP.toFixed(4) } } : {}), ...(inputModalities ? { inputModalities } : {}) };
  }

  // Cheap candidates from vendors the roster doesn't cover (review only).
  const covered = new Set(liveRoster.flatMap((m) => Object.values(m.routes ?? {}).map((id) => String(id).split("/")[0])));
  const candidates = (or?.raw ?? [])
    .filter((m) => !m.id.includes(":") && !m.id.startsWith("~") && !covered.has(m.id.split("/")[0]))
    .map((m) => ({ id: m.id, family: m.id.split("/")[0], inputPer1M: per1M(m.pricing?.prompt) ?? Infinity, outputPer1M: per1M(m.pricing?.completion) ?? Infinity }))
    .filter((m) => m.inputPer1M > 0 && (m.inputPer1M * 3 + m.outputPer1M) / 4 <= LIVE_MAX_BLENDED_USD_PER_M)
    .sort((a, b) => a.family.localeCompare(b.family) || a.inputPer1M - b.inputPer1M)
    .filter((m, i, arr) => i === 0 || arr[i - 1].family !== m.family)
    .slice(0, 30);

  // Free plan: seeds must be listed at $0; other $0 `:free` models become fallbacks.
  let free: SyncSnapshot["free"];
  let freeExtras: SyncSnapshot["freeExtras"];
  if (or) {
    free = {};
    for (const m of freeRoster) {
      const slug = m.routes?.openrouter ?? "";
      const listed = orById.get(slug);
      const inputModalities = modalitiesOf(listed);
      free[m.id] = { listed: Boolean(listed), zeroPriced: isZeroPriced(listed?.pricing), ...(inputModalities ? { inputModalities } : {}) };
    }
    const seeded = new Set(freeRoster.map((m) => m.routes?.openrouter));
    freeExtras = or.raw
      .filter((m) => m.id.endsWith(":free") && !seeded.has(m.id) && isZeroPriced(m.pricing) && !FREE_FALLBACK_EXCLUDE.some((rx) => rx.test(m.id)))
      .map((m) => ({ id: m.id, contextWindow: typeof m.context_length === "number" ? m.context_length : null, ...(modalitiesOf(m) ? { inputModalities: modalitiesOf(m) } : {}) }))
      .slice(0, 20);
  }

  const snap: SyncSnapshot = { syncedAt: new Date().toISOString(), fetched: { openrouter: Boolean(or), openai: Boolean(oa), nvidia: Boolean(nv) }, models, candidates, free, freeExtras, errors };
  if (opts.write !== false) {
    await fs.mkdir(path.dirname(snapshotPath()), { recursive: true });
    await fs.writeFile(snapshotPath(), JSON.stringify(snap, null, 2));
    cache = null;
    freeCache = null;
  }
  return snap;
}

/** Apply a snapshot to the static roster (pure; exported for tests). */
export function applySnapshot(roster: readonly ModelSpec[], snap: SyncSnapshot | null): ModelSpec[] {
  if (!snap) return roster.map((m) => ({ ...m, routes: { ...m.routes } }));
  return roster.map((m) => {
    const s = snap.models[m.id];
    const routes = { ...m.routes };
    if (s) for (const [route, listed] of Object.entries(s.routes) as [LiveRoute, boolean][]) if (listed === false) delete routes[route];
    const price = s?.openRouterPrice;
    const pricing = price ? [{ from: null, inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M, note: `OpenRouter list price, synced ${snap.syncedAt.slice(0, 10)}` }] : m.pricing;
    const w = pricing[0];
    const tooDear = w ? (w.inputPer1M * 3 + w.outputPer1M) / 4 > LIVE_MAX_BLENDED_USD_PER_M : true;
    // Modalities: the synced OpenRouter list wins over the seed (a model can gain or lose image input).
    const inputModalities = s?.inputModalities ?? m.inputModalities;
    return { ...m, routes, pricing, ...(inputModalities ? { inputModalities: [...inputModalities] } : {}), routable: Object.keys(routes).length > 0 && !tooDear };
  });
}

let cache: { at: number; roster: ModelSpec[] } | null = null;

/** Live roster with the latest sync snapshot applied (cached for a minute). */
export function loadLiveCatalog(): ModelSpec[] {
  if (cache && Date.now() - cache.at < 60_000) return cache.roster;
  let snap: SyncSnapshot | null = null;
  try {
    snap = JSON.parse(readFileSync(snapshotPath(), "utf8")) as SyncSnapshot;
  } catch {
    snap = null;
  }
  cache = { at: Date.now(), roster: applySnapshot(liveRoster, snap) };
  return cache.roster;
}

/**
 * Free roster with a snapshot applied (pure; exported for tests). A seed that
 * is no longer listed, or is no longer $0, is unroutable. Returns the extra
 * synced `:free` models separately (fallback only).
 */
export function applyFreeSnapshot(roster: readonly ModelSpec[], snap: SyncSnapshot | null): { roster: ModelSpec[]; extras: ModelSpec[] } {
  const out = roster.map((m) => {
    const s = snap?.free?.[m.id];
    const ok = !s || (s.listed && s.zeroPriced);
    const inputModalities = s?.inputModalities ?? m.inputModalities;
    return { ...m, routes: { ...m.routes }, ...(inputModalities ? { inputModalities: [...inputModalities] } : {}), routable: m.routable && ok };
  });
  const extras = (snap?.freeExtras ?? []).filter((x) => x.id.endsWith(":free") && !FREE_FALLBACK_EXCLUDE.some((rx) => rx.test(x.id))).map((x) => syncedFreeSpec(x.id, x.contextWindow, x.inputModalities));
  return { roster: out, extras };
}

let freeCache: { at: number; value: { roster: ModelSpec[]; extras: ModelSpec[] } } | null = null;

function readSnapshot(): SyncSnapshot | null {
  try {
    return JSON.parse(readFileSync(snapshotPath(), "utf8")) as SyncSnapshot;
  } catch {
    return null;
  }
}

/** Free-plan roster and synced fallbacks (cached for a minute). */
export function loadFreeCatalog(): { roster: ModelSpec[]; extras: ModelSpec[] } {
  if (freeCache && Date.now() - freeCache.at < 60_000) return freeCache.value;
  freeCache = { at: Date.now(), value: applyFreeSnapshot(freeRoster, readSnapshot()) };
  return freeCache.value;
}

/**
 * Fallback order for a failed free model: FREE_FALLBACK_ORDER (other families
 * first, the failed model's own family last), then synced `:free` extras.
 * Only routable $0 models; the registry guard re-checks each one.
 */
export function freeFallbacks(roster: readonly ModelSpec[], extras: readonly ModelSpec[]): (model: ModelSpec) => ModelSpec[] {
  const byId = new Map(roster.map((m) => [m.id, m]));
  const ordered = FREE_FALLBACK_ORDER.map((id) => byId.get(id)).filter((m): m is ModelSpec => Boolean(m?.routable));
  return (model) => {
    const others = ordered.filter((m) => m.id !== model.id);
    return [...others.filter((m) => m.family !== model.family), ...others.filter((m) => m.family === model.family), ...extras.filter((m) => m.routable)];
  };
}
