/**
 * Profitability guardrails at the provider boundary. `decide()` is the pure rule (unit-tested); the rest loads the state it
 * needs (feature throttles, OpenRouter balance state, the person's usage today) with short per-instance caches so the hot
 * path adds no database round trip in the common case.
 *
 * Order: kill switch → Free = free models only → negative-margin throttle → balance exhausted (fallback to :free) →
 * per-plan per-feature daily quota (paid overage may cover USD caps) → Free daily heavy-feature limit (flag, owner-pending).
 */
import { collection } from "@/lib/create/platform/store";
import { EntitlementError } from "@/lib/create/platform/plans";
import { OpsStopError } from "@/lib/ops/controls";
import { asPlanKey, costConfig, quotaFor, type CostConfig, type PlanKey } from "./config";
import { FEATURE_LABELS, type FeatureId } from "./features";
import type { EndpointKind, ProviderId } from "./usage";
import { currentCostTag } from "./context";

export type Throttle = { action: "free_models" | "block"; until: string; reason: string; at: string; by: string };
export type UserDay = { calls: number; usd: number; requests: number };

export type Decision =
  | { action: "allow" }
  | { action: "rewrite"; model: string; reason: "low_balance" | "throttle" }
  | { action: "block"; status: number; code: BlockCode; message: string };
export type BlockCode = "feature_disabled" | "free_models_only" | "feature_throttled" | "low_balance" | "quota_calls" | "quota_usd" | "free_daily";

export type DecideInput = {
  cfg: CostConfig;
  feature: FeatureId;
  plan: PlanKey | null;
  admin: boolean;
  provider: ProviderId;
  endpoint: EndpointKind;
  /** The call costs money (not a :free model, not a free endpoint). */
  paid: boolean;
  usage: UserDay | null;
  /** First provider call of this request for this feature (counts as one "use" for Free daily limits). */
  newRequest: boolean;
  throttle: Throttle | null;
  balanceExhausted: boolean;
  /** Paid overage is on for this person and has room (lets a USD quota pass instead of blocking). */
  overageRoom?: boolean;
  now?: number;
};

const label = (f: FeatureId) => FEATURE_LABELS[f] ?? f;

export const MESSAGES = {
  feature_disabled: (f: FeatureId) => `${label(f)} is switched off for now. Nothing was charged. Please try again later.`,
  free_models_only: () => "The Free plan uses free models only, so this request was not sent. Nothing was charged. Upgrade to Plus for the paid models.",
  feature_throttled: (f: FeatureId) => `${label(f)} is temporarily limited while we rebalance capacity. Nothing was charged. Please try again later.`,
  low_balance: () => "Paid generation is paused for a moment while provider credit is topped up. Nothing was charged; free models keep working.",
  quota_calls: (f: FeatureId) => `You've reached today's limit for ${label(f)} on your plan. It resets at 00:00 UTC.`,
  quota_usd: (f: FeatureId) => `You've reached today's usage cap for ${label(f)} on your plan. It resets at 00:00 UTC; your monthly credits are kept.`,
  free_daily: (f: FeatureId, n: number) => `You've used today's ${n} free ${label(f)} ${n === 1 ? "run" : "runs"}. It resets at 00:00 UTC, or upgrade to Plus for more.`,
};

export function decide(i: DecideInput): Decision {
  const { cfg, feature } = i;
  const now = i.now ?? Date.now();
  if (i.endpoint === "meta") return { action: "allow" };
  if (cfg.killSwitches[feature]) return { action: "block", status: 503, code: "feature_disabled", message: MESSAGES.feature_disabled(feature) };
  if (i.plan === "free" && cfg.flags.freeModelsOnly && i.paid && !i.admin) return { action: "block", status: 403, code: "free_models_only", message: MESSAGES.free_models_only() };
  const fallback = cfg.degrade.freeFallbackModels[0];
  const canRewrite = i.provider === "openrouter" && i.endpoint === "chat" && Boolean(fallback);
  const t = i.throttle && Date.parse(i.throttle.until) > now ? i.throttle : null;
  if (t && i.paid && !i.admin) {
    if (t.action === "free_models" && canRewrite) return { action: "rewrite", model: fallback, reason: "throttle" };
    return { action: "block", status: 503, code: "feature_throttled", message: MESSAGES.feature_throttled(feature) };
  }
  if (i.balanceExhausted && cfg.flags.degradeOnLowBalance && i.paid && i.provider === "openrouter") {
    if (canRewrite) return { action: "rewrite", model: fallback, reason: "low_balance" };
    return { action: "block", status: 503, code: "low_balance", message: MESSAGES.low_balance() };
  }
  if (cfg.flags.enforceQuotas && i.plan && !i.admin && i.usage) {
    const q = quotaFor(cfg, i.plan, feature);
    if (q?.dailyCalls !== undefined && i.usage.calls >= q.dailyCalls) return { action: "block", status: 429, code: "quota_calls", message: MESSAGES.quota_calls(feature) };
    if (q?.dailyUsd !== undefined && i.paid && i.usage.usd >= q.dailyUsd && !(cfg.flags.overage && i.overageRoom)) return { action: "block", status: 429, code: "quota_usd", message: MESSAGES.quota_usd(feature) };
  }
  if (cfg.flags.freeDailyLimits && i.plan === "free" && !i.admin && i.newRequest && i.usage) {
    const n = cfg.freeDaily.heavy[feature];
    if (n !== undefined && i.usage.requests >= n) return { action: "block", status: 429, code: "free_daily", message: MESSAGES.free_daily(feature, n) };
  }
  return { action: "allow" };
}

/* ── state: throttles + balance ──────────────────────────────────────── */

type StateRow = { id: string; workspaceId: string; throttles?: Partial<Record<FeatureId, Throttle>>; exhausted?: boolean; exhaustedSince?: string | null; exhaustedReason?: string; updatedAt?: string };
const SYSTEM = "system";
const stateRows = () => collection<StateRow>("cost_state");
const STATE_TTL = 20_000;
let state: { at: number; throttles: Partial<Record<FeatureId, Throttle>>; exhausted: boolean; exhaustedSince: string | null } | null = null;
let stateLoad: Promise<void> | null = null;

async function loadState() {
  try {
    const [t, b] = await Promise.all([stateRows().get(SYSTEM, "throttles"), stateRows().get(SYSTEM, "balance")]);
    state = { at: Date.now(), throttles: t?.throttles ?? {}, exhausted: Boolean(b?.exhausted), exhaustedSince: b?.exhaustedSince ?? null };
  } catch {
    state = { at: Date.now() - STATE_TTL / 2, throttles: state?.throttles ?? {}, exhausted: state?.exhausted ?? false, exhaustedSince: state?.exhaustedSince ?? null };
  }
}

export async function guardState() {
  if (!state) {
    stateLoad ??= loadState().finally(() => (stateLoad = null));
    await stateLoad;
  } else if (Date.now() - state.at > STATE_TTL) {
    stateLoad ??= loadState().finally(() => (stateLoad = null));
    void stateLoad.catch(() => undefined);
  }
  return state!;
}

async function upsertState(id: string, patch: Partial<StateRow>) {
  const row = { id, workspaceId: SYSTEM, ...patch, updatedAt: new Date().toISOString() } as StateRow;
  if (!(await stateRows().update(SYSTEM, id, row))) await stateRows().insertIfAbsent(row);
}

export async function setThrottle(feature: FeatureId, t: Throttle): Promise<void> {
  const cur = (await stateRows().get(SYSTEM, "throttles"))?.throttles ?? {};
  await upsertState("throttles", { throttles: { ...cur, [feature]: t } });
  state = null;
}

export async function clearThrottle(feature: FeatureId): Promise<void> {
  const cur = { ...((await stateRows().get(SYSTEM, "throttles"))?.throttles ?? {}) };
  delete cur[feature];
  await upsertState("throttles", { throttles: cur });
  state = null;
}

export async function activeThrottles(now = Date.now()): Promise<Partial<Record<FeatureId, Throttle>>> {
  const t = (await guardState()).throttles;
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v && Date.parse(v.until) > now)) as Partial<Record<FeatureId, Throttle>>;
}

/** Set when OpenRouter answers 402 or the balance check reads ≤ 0. Paid OpenRouter calls then fall back to :free models. */
export async function markBalanceExhausted(reason: string): Promise<boolean> {
  const s = await guardState();
  if (s.exhausted) return false;
  state = { ...s, exhausted: true, exhaustedSince: new Date().toISOString() };
  await upsertState("balance", { exhausted: true, exhaustedSince: state.exhaustedSince, exhaustedReason: reason.slice(0, 200) }).catch(() => undefined);
  return true;
}

export async function clearBalanceExhausted(): Promise<boolean> {
  const s = await guardState();
  if (!s.exhausted) return false;
  state = { ...s, exhausted: false, exhaustedSince: null };
  await upsertState("balance", { exhausted: false, exhaustedSince: null, exhaustedReason: "" }).catch(() => undefined);
  return true;
}

/* ── per-user usage today ────────────────────────────────────────────── */

type DayRow = { id: string; workspaceId: string; day: string; feature: FeatureId; calls: number; usd: number; requests: number };
export const userDayRows = () => collection<DayRow>("cost_user_day");
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const USER_TTL = 20_000;
const userCache = new Map<string, { at: number; v: UserDay }>();
/** Recorded locally but not yet flushed to the store (so a refresh does not forget this instance's own recent use). */
const pending = new Map<string, UserDay>();
const ukey = (userId: string, feature: FeatureId, day: string) => `${userId}|${day}|${feature}`;

export async function userUsage(userId: string, feature: FeatureId, now = Date.now()): Promise<UserDay> {
  const day = utcDay(now);
  const k = ukey(userId, feature, day);
  const hit = userCache.get(k);
  if (hit && now - hit.at < USER_TTL) return hit.v;
  let stored: UserDay = hit?.v ?? { calls: 0, usd: 0, requests: 0 };
  try {
    const r = await Promise.race([userDayRows().get(userId, `${day}:${feature}`), new Promise<null>((res) => setTimeout(() => res(null), 1500).unref?.())]);
    if (r) stored = { calls: Number(r.calls) || 0, usd: Number(r.usd) || 0, requests: Number(r.requests) || 0 };
    const p = pending.get(k);
    const v = p ? { calls: stored.calls + p.calls, usd: stored.usd + p.usd, requests: stored.requests + p.requests } : stored;
    userCache.set(k, { at: now, v });
    if (userCache.size > 5000) userCache.delete(userCache.keys().next().value as string);
    return v;
  } catch {
    return stored;
  }
}

/** The meter calls this for every recorded call (before the batch flush). */
export function noteUserUsage(userId: string, feature: FeatureId, d: UserDay, now = Date.now()): void {
  const k = ukey(userId, feature, utcDay(now));
  const add = (a: UserDay | undefined): UserDay => ({ calls: (a?.calls ?? 0) + d.calls, usd: (a?.usd ?? 0) + d.usd, requests: (a?.requests ?? 0) + d.requests });
  pending.set(k, add(pending.get(k)));
  const c = userCache.get(k);
  if (c) c.v = add(c.v);
}

/** After a flush wrote these deltas to the store. */
export function settleUserUsage(userId: string, feature: FeatureId, day: string, d: UserDay): void {
  const k = ukey(userId, feature, day);
  const p = pending.get(k);
  if (!p) return;
  const left = { calls: p.calls - d.calls, usd: p.usd - d.usd, requests: p.requests - d.requests };
  if (left.calls <= 0 && left.usd <= 1e-9 && left.requests <= 0) pending.delete(k);
  else pending.set(k, left);
}

export const resetGuardCaches = () => {
  state = null;
  userCache.clear();
  pending.clear();
};

/* ── route-level check (honest message before any work starts) ──────── */

/**
 * Called from assertCanSpend / enterUsage with the workspace: applies kill switch, throttle-block, quotas and Free daily
 * limits for the feature of the current request, throwing a user-facing error instead of letting the provider boundary
 * refuse mid-run. The provider boundary (meter) still enforces the same rules for anything that skips this.
 */
export async function assertCostGuard(ws: { id: string; plan: string; admin?: boolean; anonymous?: boolean }, feature?: FeatureId): Promise<void> {
  const f = feature ?? currentCostTag().feature;
  if (!f) return;
  const cfg = await costConfig();
  const plan = asPlanKey(ws.plan);
  const s = await guardState().catch(() => null);
  const usage = plan && !ws.anonymous ? await userUsage(ws.id, f).catch(() => null) : null;
  const d = decide({ cfg, feature: f, plan, admin: Boolean(ws.admin), provider: "openrouter", endpoint: "chat", paid: plan !== "free", usage, newRequest: true, throttle: s?.throttles[f] ?? null, balanceExhausted: false });
  if (d.action !== "block") return;
  if (d.code === "feature_disabled" || d.code === "feature_throttled") throw new OpsStopError(d.message, d.code);
  if (d.code === "free_models_only") return; // the route picks free models itself; only the provider boundary enforces this
  throw new EntitlementError(d.message, plan === "free" ? "plus" : plan === "plus" ? "pro" : undefined);
}
