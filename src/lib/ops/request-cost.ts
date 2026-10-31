/**
 * Per-request cost log (collection system_request_costs, one row per answered /api/keplar request that reached the engine).
 * Provider cost is the sum of the real per-call USD the registry already records (telemetry.ts), collected through an
 * AsyncLocalStorage scope so every call made for this request is attributed to it. Nothing is estimated here: a request with
 * no billed calls (Free models, instant replies) logs $0. No prompt or answer text is stored.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { isStoreUnavailable } from "@/lib/create/platform/neon";
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";
import { flightPush, type FlightLog } from "./flight";

export type CostScope = {
  calls: number;
  failed: number;
  usd: number;
  models: Set<string>;
  /** Models whose call succeeded (what the admin activity feed shows). */
  answeredBy?: Set<string>;
  /**
   * Requests actually SENT to a live provider for this question, counted when they leave (so a stand-in that was cancelled, a
   * timed-out call and a 429 all count: each one spends the provider's request quota). `calls` only counts calls that came back.
   */
  sent?: number;
  /** Of the calls that came back: how many were provider 429s, and how many requests each pipeline stage sent (panel / verifier = extraction + review / judge = write-up). */
  rateLimited?: number;
  sentBySlot?: Record<string, number>;
  /** Free plan: the person's own daily provider-request budget (usage/call-budget.ts). Absent = none applies. */
  callBudget?: { key: string; limit: number };
  /** Cost-meter attribution for every provider call in this request (src/lib/cost/meter.ts): feature from the modes, user, plan. */
  tag?: { feature?: string; userId?: string | null; plan?: string; admin?: boolean };
  /** The request's execution timeline (flight.ts): stages, provider requests and outcome. Text-free by construction. */
  flight?: FlightLog;
};
const als = new AsyncLocalStorage<CostScope>();

export const newScope = (): CostScope => ({ calls: 0, failed: 0, usd: 0, models: new Set(), answeredBy: new Set(), sent: 0, rateLimited: 0, sentBySlot: {} });
export const runInCostScope = <T>(scope: CostScope, fn: () => T): T => als.run(scope, fn);
/** The request scope in progress, if any (the cost meter reads its `tag`). */
export const currentCostScope = (): CostScope | null => als.getStore() ?? null;

/** Called from recordModelCall. A call outside any scope (cron, agents) is simply not attributed to a request. */
export function noteModelCall(c: { model: string; ok: boolean; usd: number; reason?: string; latencyMs?: number; provider?: string }): void {
  const s = als.getStore();
  if (!s) return;
  flightPush(s.flight, { k: "call", model: c.model, provider: c.provider, ok: c.ok, reason: c.reason, ms: c.latencyMs, usd: c.usd });
  s.calls++;
  if (!c.ok) s.failed++;
  if (c.reason === "rate_limited") s.rateLimited = (s.rateLimited ?? 0) + 1;
  if (Number.isFinite(c.usd) && c.usd > 0) s.usd += c.usd;
  s.models.add(c.model);
  if (c.ok) (s.answeredBy ??= new Set()).add(c.model);
}

/** The request in progress's per-person provider-request budget, if any. */
export const callBudgetOf = (): { key: string; limit: number } | null => als.getStore()?.callBudget ?? null;

/** Called by the registry right before a request goes out to a live provider (a count and a stage label only; never text). */
export function noteCallSent(slot: string, model?: string): void {
  const s = als.getStore();
  if (!s) return;
  flightPush(s.flight, { k: "sent", slot, model });
  s.sent = (s.sent ?? 0) + 1;
  const by = (s.sentBySlot ??= {});
  by[slot] = (by[slot] ?? 0) + 1;
}

export type RequestCostRow = {
  id: string;
  workspaceId: string;
  at: string;
  reqId: string;
  plan: string;
  /** Account id, or null when signed out. Admin-only reading; removed with the 30-day retention. */
  accountId: string | null;
  kind: "answer" | "instant";
  modelCalls: number;
  failedCalls: number;
  distinctModels: number;
  usd: number;
  /** Credits charged to the account (0 on Free, instant replies, and unanswered runs). */
  units: number;
  durationMs: number;
  answered: boolean;
  /** Why fewer models were used: the person's plan day-cap, instance load, the global spend breaker, or the shared Free request pool running low (pool-governor.ts). */
  degraded: "daily_fanout" | "load" | "breaker" | "pool" | "calls" | null;
  maxModels: number | null;
  /** Model ids whose calls succeeded for this request (at most 6; ids only, never text). Missing on rows written before this field. */
  answeredBy?: string[];
  /**
   * Requests sent to live providers for this question, including cancelled stand-ins and 429s (what a provider's request quota
   * counts). On Free this is what the shared OpenRouter pool is charged. Missing on rows written before this field.
   */
  providerCalls?: number;
  /** Provider 429 answers among them. */
  rateLimited?: number;
  /** Requests per stage: panel, verifier (position extraction + review) and judge (write-up). */
  callsBySlot?: Record<string, number>;
};

const rows = () => collection<RequestCostRow>("system_request_costs");

export function recordRequestCost(scope: CostScope, f: Omit<RequestCostRow, "id" | "workspaceId" | "at" | "modelCalls" | "failedCalls" | "distinctModels" | "usd">): void {
  rows()
    .insert({ id: id("rc"), workspaceId: "system", at: new Date().toISOString(), ...f, modelCalls: scope.calls, failedCalls: scope.failed, distinctModels: scope.models.size, providerCalls: scope.sent ?? scope.calls, rateLimited: scope.rateLimited ?? 0, callsBySlot: { ...(scope.sentBySlot ?? {}) }, answeredBy: [...(scope.answeredBy ?? [])].slice(0, 6), usd: Math.round(scope.usd * 1e6) / 1e6 })
    .catch((e) => { if (!isStoreUnavailable(e)) console.error("[ops] request cost not recorded:", e instanceof Error ? e.name : "error"); });
}

export type CostSummary = {
  requests: number;
  answered: number;
  usd: number;
  avgUsd: number;
  p95Usd: number;
  degraded: Record<string, number>;
  byPlan: { plan: string; requests: number; usd: number; avgUsd: number; units: number; providerCalls: number; avgCalls: number }[];
  byDay: { day: string; requests: number; usd: number }[];
  top: RequestCostRow[];
};

export function summarizeCosts(list: RequestCostRow[]): CostSummary {
  const usd = list.reduce((t, r) => t + r.usd, 0);
  const sorted = [...list].map((r) => r.usd).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  const degraded: Record<string, number> = {};
  const plans = new Map<string, { requests: number; usd: number; units: number; providerCalls: number }>();
  const days = new Map<string, { requests: number; usd: number }>();
  for (const r of list) {
    if (r.degraded) degraded[r.degraded] = (degraded[r.degraded] ?? 0) + 1;
    const p = plans.get(r.plan) ?? { requests: 0, usd: 0, units: 0, providerCalls: 0 };
    p.requests++; p.usd += r.usd; p.units += r.units; p.providerCalls += r.providerCalls ?? r.modelCalls;
    plans.set(r.plan, p);
    const d = days.get(r.at.slice(0, 10)) ?? { requests: 0, usd: 0 };
    d.requests++; d.usd += r.usd;
    days.set(r.at.slice(0, 10), d);
  }
  return {
    requests: list.length,
    answered: list.filter((r) => r.answered).length,
    usd,
    avgUsd: list.length ? usd / list.length : 0,
    p95Usd: p95,
    degraded,
    byPlan: [...plans].map(([plan, v]) => ({ plan, ...v, avgUsd: v.requests ? v.usd / v.requests : 0, avgCalls: v.requests ? v.providerCalls / v.requests : 0 })).sort((a, b) => b.usd - a.usd),
    byDay: [...days].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    top: [...list].sort((a, b) => b.usd - a.usd).slice(0, 15),
  };
}

export async function recentRequestCosts(days = 7, limit = 20_000): Promise<RequestCostRow[]> {
  return rows().listSystemRange({ field: "at", gte: new Date(Date.now() - days * 864e5).toISOString() }, limit);
}

/** Attributes provider calls made in the current async context to `scope` (used inside a streaming response, where `run` cannot wrap the body). */
export const enterCostScope = (scope: CostScope): void => als.enterWith(scope);
