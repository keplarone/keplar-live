/**
 * One budgeted model call for Core. Every call goes through the normal provider registry (spend cap, Free price guard,
 * shared Free pool, quality gate, operator kill switches), and is counted against Core's explicit budget first.
 */
import { sanitizeParams } from "@/lib/orchestration/pricing";
import type { Classification, ModelSpec, ProviderResult } from "@/lib/orchestration/types";
import type { createRegistry } from "@/lib/orchestration/providers";
import type { CoreBudgetUse, StopReason } from "./types";
import type { DepthBudget } from "./config";

export type Registry = Pick<ReturnType<typeof createRegistry>, "generate" | "chain" | "freeOnly">;

export class CoreBudget {
  calls = 0;
  usd = 0;
  readonly started = Date.now();
  stopped: StopReason | null = null;
  constructor(readonly limit: DepthBudget, readonly extraUsdCap = Infinity, private now: () => number = Date.now) {}
  elapsed() { return this.now() - this.started; }
  msLeft() { return this.limit.ms - this.elapsed(); }
  /** Can another call of roughly `ms` start? Records why not. */
  canSpend(estMs = 8_000): boolean {
    if (this.stopped) return false;
    if (this.calls >= this.limit.calls) { this.stopped = "budget"; return false; }
    if (this.usd >= Math.min(this.limit.usd || Infinity, this.extraUsdCap) && this.limit.usd > 0) { this.stopped = "budget"; return false; }
    if (this.msLeft() < Math.min(estMs, 20_000)) { this.stopped = "time"; return false; }
    return true;
  }
  use(): CoreBudgetUse {
    return { calls: this.calls, callLimit: this.limit.calls, ms: this.elapsed(), msLimit: this.limit.ms, ...(this.usd ? { usd: Math.round(this.usd * 10000) / 10000 } : {}) };
  }
}

const POOL_WORDS = /busy|limit|not sent|budget reached/i;

export async function coreCall(i: {
  registry: Registry;
  budget: CoreBudget;
  model: ModelSpec;
  system: string;
  prompt: string;
  classification: Classification;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ ok: true; text: string; model: ModelSpec; latencyMs: number } | { ok: false; reason: string }> {
  if (!i.budget.canSpend()) return { ok: false, reason: i.budget.stopped ?? "budget" };
  i.budget.calls++;
  const cap = Math.max(4_000, Math.min(i.timeoutMs ?? 45_000, i.budget.msLeft()));
  const signal = i.signal ? AbortSignal.any([i.signal, AbortSignal.timeout(cap)]) : AbortSignal.timeout(cap);
  let r: ProviderResult & { model?: ModelSpec };
  try {
    r = await i.registry.generate({
      model: i.model,
      prompt: i.prompt,
      system: i.system,
      classification: i.classification,
      params: sanitizeParams(i.model, { reasoningEffort: i.effort ?? "medium", maxOutputTokens: i.maxTokens }),
      slot: "verifier",
      signal,
    });
  } catch (e) {
    if (i.signal?.aborted) { i.budget.stopped = "cancelled"; throw e; }
    return { ok: false, reason: "timeout" };
  }
  if (r.ok) {
    i.budget.usd += r.actualCostUsd ?? 0;
    return { ok: true, text: r.text, model: r.model ?? i.model, latencyMs: r.latencyMs };
  }
  // The shared Free pool or the daily spend cap said no: stop asking (more calls would only be refused too).
  if (r.reason === "rate_limited" || POOL_WORDS.test(r.message)) i.budget.stopped = i.budget.stopped ?? "pool";
  return { ok: false, reason: r.message || r.reason };
}

/** Lenient JSON from a model reply: the first {...} or [...] block, with trailing commas forgiven. */
export function parseJson<T>(text: string): T | null {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.search(/[[{]/);
  if (start < 0) return null;
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      try { return JSON.parse(t.slice(start, i + 1).replace(/,\s*([}\]])/g, "$1")) as T; } catch { return null; }
    }
  }
  return null;
}
