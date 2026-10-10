/**
 * Cost-guard configuration. Every number that decides price, quota, throttle or alert lives here, so pricing can change
 * without code edits:
 *
 *   defaults (this file) ← KEPLAR_COST_CONFIG (JSON, deep-merged) ← admin overrides (store row `cost_config/config`,
 *   edited on /admin/profitability) ← single env switches (KEPLAR_FEATURE_OFF, KEPLAR_FLAG_*).
 *
 * The merged value is cached per instance for CACHE_MS; `saveCostConfigPatch` clears the cache.
 * Owner-pending pricing (Free daily limits, paid overage) ships behind flags that default OFF everywhere.
 */
import { collection } from "@/lib/create/platform/store";
import { PAID_PLANS } from "@/lib/billing/plans";
import { FEATURES, isFeature, type FeatureId } from "./features";

export type PlanKey = "free" | "lite" | "plus" | "pro" | "business";
export const PLAN_KEYS: PlanKey[] = ["free", "lite", "plus", "pro", "business"];
export const asPlanKey = (p: unknown): PlanKey | null => (PLAN_KEYS as unknown[]).includes(p) ? (p as PlanKey) : null;

/** Per user, per UTC day, per feature. `dailyCalls` = provider requests; `dailyUsd` = metered provider cost. */
export type FeatureQuota = { dailyCalls?: number; dailyUsd?: number };
export type QuotaKey = FeatureId | "*";

export type CostFlags = {
  /** Per-plan per-feature daily quotas (provider calls / USD) at the provider boundary. */
  enforceQuotas: boolean;
  /** Free plan: any call that would cost money is refused (backstop to orchestration/free-guard.ts). */
  freeModelsOnly: boolean;
  /** A feature whose trailing cost exceeds its allocated revenue is throttled automatically. */
  autoThrottle: boolean;
  /** Paid OpenRouter models fall back to :free models while the OpenRouter balance is exhausted (instead of erroring). */
  degradeOnLowBalance: boolean;
  /** OWNER-PENDING. Free plan per-feature daily use limits (heavy features). Default OFF. */
  freeDailyLimits: boolean;
  /** OWNER-PENDING. Opt-in pay-as-you-go overage above plan caps for paid plans. Default OFF. */
  overage: boolean;
};

export type CostConfig = {
  flags: CostFlags;
  revenue: {
    /** Monthly list price per plan (USD). Business is custom: set the contract average here. */
    planMonthlyUsd: Record<PlanKey, number>;
    /** Read live subscription amounts from Stripe when STRIPE_SECRET_KEY is set (by price lookup key). */
    useStripe: boolean;
    stripeLookupKeys: Record<string, PlanKey>;
  };
  pricing: {
    /** Provider USD that one credit stands for (src/lib/create/platform/compute.ts USD_PER_UNIT). */
    usdPerCredit: number;
    /** Extra multiplier applied when credits are charged (on top of orchestration METER_MARGIN). 1 = unchanged. */
    marginMultiplier: number;
    featureMultiplier: Partial<Record<FeatureId, number>>;
  };
  quotas: Record<PlanKey, Partial<Record<QuotaKey, FeatureQuota>>>;
  killSwitches: Partial<Record<FeatureId, boolean>>;
  /** Overhead features whose cost is carried by another feature's revenue (titles are part of asking). */
  overheadOf: Partial<Record<FeatureId, FeatureId>>;
  margin: { windowDays: number; minCostUsd: number; targetMarginPct: number; throttleHours: number; throttleAction: "free_models" | "block" };
  anomaly: { factor: number; minUsd: number; userDailyUsd: number };
  /** OpenRouter: the user's 1% alert, plus days of runway (remaining ÷ trailing-24h spend): warn at 7 days, critical at 2. */
  lowBalance: { percent: number; basis: "last_topup" | "total"; floorUsd: number; runwayWarnDays: number; runwayCriticalDays: number };
  /** KEPLAR_GLOBAL_DAILY_USD_CAP (live value is never changed here): alert at `alertPct`% of it, and suggest a cap of `recommendFactor` × the busiest recent day. */
  globalCap: { alertPct: number; recommendFactor: number };
  degrade: { freeFallbackModels: string[] };
  /** OWNER-PENDING (flag freeDailyLimits): applied only with the flag on; off = the live limit (limitsFor("free").dailyRequests, 50/day) is untouched. */
  freeDaily: { questions: number; anonQuestions: number; heavy: Partial<Record<FeatureId, number>>; reset: "utc_midnight" };
  overage: {
    features: FeatureId[];
    /** Floor: overage is never priced below provider cost × multiplier (4.0 ≈ ≥70% margin after fees). */
    multiplier: number;
    /** Credit-metered overage price: `usd` per `credits` (the "1,000 credits = $7.50" pack, same rate as Plus). */
    creditPack: { credits: number; usd: number };
    /** Candidate list prices per unit (financial model §6, ~3.8–4.0× provider cost); shown to users, owner-pending. */
    priceList: { unit: string; providerCostUsd: number; usd: number }[];
    defaultCapUsd: number;
    maxCapUsd: number;
    alertPcts: number[];
    stripe: { meterEventName: string; priceLookupKey: string };
  };
};

export const DEFAULT_COST_CONFIG: CostConfig = {
  flags: { enforceQuotas: true, freeModelsOnly: true, autoThrottle: true, degradeOnLowBalance: true, freeDailyLimits: false, overage: false },
  revenue: {
    planMonthlyUsd: { free: 0, lite: PAID_PLANS.lite.usdMonthly, plus: PAID_PLANS.plus.usdMonthly, pro: PAID_PLANS.pro.usdMonthly, business: 0 },
    useStripe: true,
    stripeLookupKeys: { keplar_plus_monthly: "plus", keplar_pro_monthly: "pro" },
  },
  pricing: { usdPerCredit: 0.002, marginMultiplier: 1, featureMultiplier: {} },
  quotas: {
    // Free runs on $0 models: the caps protect the shared free-model pool, counted in provider requests per day.
    free: {
      "*": { dailyCalls: 600 }, "deep-research": { dailyCalls: 60 }, debate: { dailyCalls: 150 }, "core-reasoning": { dailyCalls: 100 }, slides: { dailyCalls: 60 },
      study: { dailyCalls: 150 }, create: { dailyCalls: 80 }, critic: { dailyCalls: 40 }, multimodal: { dailyCalls: 80 }, agents: { dailyCalls: 60 },
      images: { dailyCalls: 20 }, video: { dailyCalls: 0 }, transcribe: { dailyCalls: 30 }, api: { dailyCalls: 300 }, embed: { dailyCalls: 300 },
    },
    // Paid: credits are the monthly wall; these are per-feature daily burst backstops in metered provider USD.
    lite: { "*": { dailyUsd: 1.5 } },
    plus: { "*": { dailyUsd: 4 }, images: { dailyUsd: 2 }, "deep-research": { dailyUsd: 3.5 }, create: { dailyUsd: 3 } },
    pro: { "*": { dailyUsd: 8 }, images: { dailyUsd: 4 }, video: { dailyUsd: 6 }, "deep-research": { dailyUsd: 6 }, create: { dailyUsd: 6 } },
    business: { "*": { dailyUsd: 25 } },
  },
  killSwitches: {},
  overheadOf: { title: "ask", memory: "ask", support: "system" },
  margin: { windowDays: 7, minCostUsd: 5, targetMarginPct: 0, throttleHours: 24, throttleAction: "free_models" },
  anomaly: { factor: 3, minUsd: 2, userDailyUsd: 5 },
  lowBalance: { percent: 1, basis: "last_topup", floorUsd: 0, runwayWarnDays: 7, runwayCriticalDays: 2 },
  globalCap: { alertPct: 80, recommendFactor: 1.5 },
  degrade: { freeFallbackModels: ["nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-ultra-550b-a55b:free"] },
  // Business plan §8 recommendation: 25/day signed in, 5/day anonymous (live today: 50/day; changes only when the flag is on).
  freeDaily: { questions: 25, anonQuestions: 5, heavy: { "deep-research": 1, debate: 3, slides: 2, study: 5, create: 3, images: 3, multimodal: 5, transcribe: 5, agents: 2, "core-reasoning": 3 }, reset: "utc_midnight" },
  overage: {
    features: ["create", "voice-create", "transcribe", "images", "video", "deep-research", "api"],
    // Overage price = provider cost × 4.0 (≥70% gross margin on overage, business plan §8). Never below 1×.
    multiplier: 4,
    creditPack: { credits: 1000, usd: 7.5 },
    // financial-model-100k.md §6: price = cost × (1 + OpenRouter fee) ÷ (1 − 70% − 3.6% payment fees), rounded up.
    priceList: [
      { unit: "1,000 credits (top-up pack)", providerCostUsd: 1.82, usd: 7.5 },
      { unit: "Deep Research run", providerCostUsd: 2.18, usd: 9 },
      { unit: "Image, High", providerCostUsd: 0.052, usd: 0.2 },
      { unit: "Image, Standard", providerCostUsd: 0.015, usd: 0.06 },
      { unit: "Video, per second", providerCostUsd: 0.092, usd: 0.35 },
      { unit: "Voice, per minute", providerCostUsd: 0.026, usd: 0.1 },
      { unit: "Create build, Plus model", providerCostUsd: 0.157, usd: 0.65 },
      { unit: "Create build, Pro model", providerCostUsd: 0.351, usd: 1.45 },
      { unit: "Sandbox, extra minute", providerCostUsd: 0.0027, usd: 0.02 },
      { unit: "Hosting bandwidth, per GB", providerCostUsd: 0.15, usd: 0.6 },
      { unit: "API: consensus answer", providerCostUsd: 0.039, usd: 0.16 },
      { unit: "API: single-model answer", providerCostUsd: 0.0044, usd: 0.02 },
    ],
    defaultCapUsd: 20,
    maxCapUsd: 500,
    alertPcts: [50, 80, 100],
    stripe: { meterEventName: "keplar_overage", priceLookupKey: "keplar_overage_usage" },
  },
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep merge (objects merge, arrays and scalars replace). Unknown top-level keys are dropped. */
export function mergeConfig<T>(base: T, patch: unknown): T {
  if (!isObj(patch) || !isObj(base)) return base;
  const out: Json = { ...(base as Json) };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in out) && base === (DEFAULT_COST_CONFIG as unknown)) continue;
    const cur = out[k];
    out[k] = isObj(cur) && isObj(v) ? mergeConfig(cur, v) : v;
  }
  return out as T;
}

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < min || n > max ? undefined : n;
};

/**
 * Validates an admin patch. Keeps only known keys with sane values; throws on nothing (bad fields are dropped and listed).
 * Returns the clean patch and the names of rejected fields so the admin UI can say what was ignored.
 */
export function sanitizeConfigPatch(input: unknown): { patch: Json; rejected: string[] } {
  const rejected: string[] = [];
  const patch: Json = {};
  if (!isObj(input)) return { patch, rejected: ["(body)"] };
  if (isObj(input.flags)) {
    const f: Json = {};
    for (const k of Object.keys(DEFAULT_COST_CONFIG.flags)) if (k in input.flags) { if (typeof input.flags[k] === "boolean") f[k] = input.flags[k]; else rejected.push(`flags.${k}`); }
    if (Object.keys(f).length) patch.flags = f;
  }
  if (isObj(input.killSwitches)) {
    const ks: Json = {};
    for (const [k, v] of Object.entries(input.killSwitches)) { if (isFeature(k) && typeof v === "boolean") ks[k] = v; else rejected.push(`killSwitches.${k}`); }
    if (Object.keys(ks).length) patch.killSwitches = ks;
  }
  if (isObj(input.revenue) && isObj(input.revenue.planMonthlyUsd)) {
    const pm: Json = {};
    for (const [k, v] of Object.entries(input.revenue.planMonthlyUsd)) {
      const n = num(v, 0, 100_000);
      if (asPlanKey(k) && n !== undefined) pm[k] = n;
      else rejected.push(`revenue.planMonthlyUsd.${k}`);
    }
    if (Object.keys(pm).length) patch.revenue = { planMonthlyUsd: pm };
  }
  if (isObj(input.pricing)) {
    const p: Json = {};
    const m = num(input.pricing.marginMultiplier, 0.5, 20);
    if ("marginMultiplier" in input.pricing) { if (m !== undefined) p.marginMultiplier = m; else rejected.push("pricing.marginMultiplier"); }
    if (isObj(input.pricing.featureMultiplier)) {
      const fm: Json = {};
      for (const [k, v] of Object.entries(input.pricing.featureMultiplier)) {
        const n = num(v, 0.5, 20);
        if (isFeature(k) && n !== undefined) fm[k] = n;
        else rejected.push(`pricing.featureMultiplier.${k}`);
      }
      p.featureMultiplier = fm;
    }
    if (Object.keys(p).length) patch.pricing = p;
  }
  if (isObj(input.quotas)) {
    const q: Json = {};
    for (const [plan, byFeature] of Object.entries(input.quotas)) {
      if (!asPlanKey(plan) || !isObj(byFeature)) { rejected.push(`quotas.${plan}`); continue; }
      const pf: Json = {};
      for (const [feat, quota] of Object.entries(byFeature)) {
        if ((feat !== "*" && !isFeature(feat)) || !isObj(quota)) { rejected.push(`quotas.${plan}.${feat}`); continue; }
        const one: Json = {};
        const c = num(quota.dailyCalls, 0, 1_000_000);
        const u = num(quota.dailyUsd, 0, 100_000);
        if (c !== undefined) one.dailyCalls = Math.floor(c);
        if (u !== undefined) one.dailyUsd = u;
        if (Object.keys(one).length) pf[feat] = one;
        else rejected.push(`quotas.${plan}.${feat}`);
      }
      q[plan] = pf;
    }
    if (Object.keys(q).length) patch.quotas = q;
  }
  for (const [section, fields] of [
    ["margin", { windowDays: [1, 90], minCostUsd: [0, 100_000], targetMarginPct: [0, 95], throttleHours: [1, 720] }],
    ["anomaly", { factor: [1.1, 100], minUsd: [0, 100_000], userDailyUsd: [0, 100_000] }],
    ["lowBalance", { percent: [0, 50], floorUsd: [0, 100_000], runwayWarnDays: [0, 90], runwayCriticalDays: [0, 90] }],
    ["globalCap", { alertPct: [10, 100], recommendFactor: [1, 10] }],
    ["overage", { multiplier: [1, 20], defaultCapUsd: [0, 10_000], maxCapUsd: [0, 100_000] }],
    ["freeDaily", { questions: [0, 10_000], anonQuestions: [0, 10_000] }],
  ] as const) {
    const src = input[section];
    if (!isObj(src)) continue;
    const out: Json = {};
    for (const [k, [lo, hi]] of Object.entries(fields)) {
      if (!(k in src)) continue;
      const n = num(src[k], lo, hi);
      if (n !== undefined) out[k] = n;
      else rejected.push(`${section}.${k}`);
    }
    if (section === "margin" && "throttleAction" in src) { if (src.throttleAction === "free_models" || src.throttleAction === "block") out.throttleAction = src.throttleAction; else rejected.push("margin.throttleAction"); }
    if (section === "lowBalance" && "basis" in src) { if (src.basis === "last_topup" || src.basis === "total") out.basis = src.basis; else rejected.push("lowBalance.basis"); }
    if (section === "freeDaily" && isObj(src.heavy)) {
      const h: Json = {};
      for (const [k, v] of Object.entries(src.heavy)) {
        const n = num(v, 0, 10_000);
        if (isFeature(k) && n !== undefined) h[k] = Math.floor(n);
        else rejected.push(`freeDaily.heavy.${k}`);
      }
      out.heavy = h;
    }
    if (Object.keys(out).length) patch[section] = out;
  }
  return { patch, rejected };
}

/** Env layer: KEPLAR_COST_CONFIG JSON, KEPLAR_FEATURE_OFF=a,b and KEPLAR_FLAG_<NAME>=1|0. Pure. */
export function applyEnv(c: CostConfig, env: Record<string, string | undefined> = process.env): CostConfig {
  let out = c;
  const raw = env.KEPLAR_COST_CONFIG?.trim();
  if (raw) {
    try {
      out = mergeConfig(out, sanitizeConfigPatch(JSON.parse(raw)).patch);
    } catch {
      console.error("[cost] KEPLAR_COST_CONFIG is not valid JSON; ignored.");
    }
  }
  const off = (env.KEPLAR_FEATURE_OFF ?? "").split(",").map((s) => s.trim()).filter(isFeature);
  if (off.length) out = { ...out, killSwitches: { ...out.killSwitches, ...Object.fromEntries(off.map((f) => [f, true])) } };
  const flagEnv: Record<keyof CostFlags, string> = {
    enforceQuotas: "KEPLAR_FLAG_ENFORCE_QUOTAS", freeModelsOnly: "KEPLAR_FLAG_FREE_MODELS_ONLY", autoThrottle: "KEPLAR_FLAG_AUTO_THROTTLE",
    degradeOnLowBalance: "KEPLAR_FLAG_DEGRADE_ON_LOW_BALANCE", freeDailyLimits: "KEPLAR_FLAG_FREE_DAILY_LIMITS", overage: "KEPLAR_FLAG_OVERAGE",
  };
  const flags = { ...out.flags };
  for (const [k, name] of Object.entries(flagEnv) as [keyof CostFlags, string][]) {
    const v = env[name]?.trim();
    if (v === "1" || v === "true") flags[k] = true;
    if (v === "0" || v === "false") flags[k] = false;
  }
  return { ...out, flags };
}

/** The quota for one plan + feature (feature entry, else "*"). */
export function quotaFor(c: CostConfig, plan: PlanKey, feature: FeatureId): FeatureQuota | null {
  const q = c.quotas[plan];
  return q?.[feature] ?? q?.["*"] ?? null;
}

export const featureMultiplier = (c: CostConfig, feature: FeatureId | null | undefined): number => Math.max(0.5, (c.pricing.marginMultiplier || 1) * ((feature && c.pricing.featureMultiplier[feature]) || 1));

/* ── loading ─────────────────────────────────────────────────────────── */

type Row = { id: string; workspaceId: string; patch: Json; updatedAt: string; updatedBy: string };
const rows = () => collection<Row>("cost_config");
const SYSTEM = "system";
const KEY = "config";
export const CACHE_MS = 30_000;
let cached: { at: number; value: CostConfig; overrides: Json } | null = null;
let inflight: Promise<CostConfig> | null = null;

async function load(): Promise<CostConfig> {
  let overrides: Json = cached?.overrides ?? {};
  try {
    overrides = (await rows().get(SYSTEM, KEY))?.patch ?? {};
  } catch {
    /* store down: keep the last known overrides */
  }
  const value = applyEnv(mergeConfig(DEFAULT_COST_CONFIG, overrides));
  cached = { at: Date.now(), value, overrides };
  return value;
}

/** Current config (stale-while-revalidate, never throws). */
export async function costConfig(): Promise<CostConfig> {
  if (!cached) {
    inflight ??= load().finally(() => (inflight = null));
    return inflight;
  }
  if (Date.now() - cached.at > CACHE_MS) {
    inflight ??= load().finally(() => (inflight = null));
    void inflight.catch(() => undefined);
  }
  return cached.value;
}

/** Synchronous best effort for hot paths that cannot await (defaults + env until the first load finishes). */
export function costConfigSync(): CostConfig {
  if (!cached) void costConfig().catch(() => undefined);
  return cached?.value ?? applyEnv(DEFAULT_COST_CONFIG);
}

export async function costConfigOverrides(): Promise<{ patch: Json; updatedAt: string | null; updatedBy: string | null }> {
  const r = await rows().get(SYSTEM, KEY).catch(() => null);
  return { patch: r?.patch ?? {}, updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null };
}

/** Admin: merge a validated patch into the stored overrides. */
export async function saveCostConfigPatch(input: unknown, actor: string): Promise<{ config: CostConfig; rejected: string[] }> {
  const { patch, rejected } = sanitizeConfigPatch(input);
  const cur = (await rows().get(SYSTEM, KEY))?.patch ?? {};
  const next = mergeConfig({ ...DEFAULT_COST_CONFIG, ...cur } as unknown as Json, patch);
  // Store only the override sections that were ever touched (not the whole default config).
  const stored: Json = { ...cur };
  for (const k of Object.keys(patch)) stored[k] = (next as Json)[k];
  const row: Row = { id: KEY, workspaceId: SYSTEM, patch: stored, updatedAt: new Date().toISOString(), updatedBy: actor };
  if (!(await rows().update(SYSTEM, KEY, row))) await rows().insertIfAbsent(row);
  cached = null;
  return { config: await costConfig(), rejected };
}

export const resetCostConfigCache = () => {
  cached = null;
  inflight = null;
};

export { FEATURES };
