/**
 * Model calls for Slides and Study, through the same provider registry the chat engine uses
 * (spend guard, Free-only price guard, fallbacks). One ToolRun per user request: it adds up the cost
 * of every call, and `settle` charges the ledger once, from the cost the providers reported (plus the
 * 1.1 margin), never for a run in which no model answered.
 */
import { loadFreeCatalog, loadLiveCatalog, freeFallbacks } from "@/lib/orchestration/catalog-sync";
import { liveEnv } from "@/lib/orchestration/config";
import { liveSpendGuard } from "@/lib/orchestration/live-budget";
import { createRegistry, defaultProviders, liveMode } from "@/lib/orchestration/providers";
import { overRequestCap, limitsFor, type LimitPlan } from "@/lib/orchestration/limits";
import { sanitizeParams, spentUsd } from "@/lib/orchestration/pricing";
import type { Classification, ModelSpec } from "@/lib/orchestration/types";
import { assertCanSpend, chargeUnits } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { creditsForUsd, toolModelIds, type ToolPlan } from "./models";

export type ToolDeps = { registry: ReturnType<typeof createRegistry>; models: ModelSpec[] };

let override: ToolDeps | null | undefined;
/** Tests only: replace the live deps (null = "models not set up"). Call with undefined to restore. */
export function setToolDeps(d: ToolDeps | null | undefined) {
  override = d;
}

/** Registry + the plan's model list, or null when live models are not configured (nothing is faked). */
export function toolDeps(plan: ToolPlan): ToolDeps | null {
  if (override !== undefined) return override;
  const free = plan === "free";
  const keyTier = free ? "free" : "paid";
  const env = liveEnv(keyTier);
  if (!liveMode(env)) return null;
  const providers = defaultProviders(keyTier);
  if (!providers.length) return null;
  const guard = liveSpendGuard(env.liveDailyUsdCap);
  if (free) {
    const cat = loadFreeCatalog();
    const byId = new Map(cat.roster.map((m) => [m.id, m]));
    const models = toolModelIds("free").map((id) => byId.get(id)).filter((m): m is ModelSpec => Boolean(m?.routable));
    if (!models.length) return null;
    return { registry: createRegistry(providers, { guard, freeOnly: true, fallbacks: freeFallbacks(cat.roster, cat.extras) }), models };
  }
  const byId = new Map(loadLiveCatalog().map((m) => [m.id, m]));
  const models = toolModelIds(plan).map((id) => byId.get(id)).filter((m): m is ModelSpec => Boolean(m?.routable));
  if (!models.length) return null;
  return { registry: createRegistry(providers, { guard, fallbacks: (m) => models.filter((x) => x.id !== m.id) }), models };
}

export const NOT_CONFIGURED = "Keplar isn't connected to its models yet. Please check back soon.";
const CLASSIFICATION: Classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 2000, estimatedOutputTokens: 1500, needsWeb: false, rationale: "Structured generation." };

export class ToolModelError extends Error {
  constructor(message: string, public busy = false) {
    super(message);
  }
}

export class ToolRun {
  usd = 0;
  calls = 0;
  ok = 0;
  /** Model that answered last (shown as "made with"). */
  model: string | null = null;
  private settled = false;

  constructor(private readonly ws: Pick<Workspace, "plan">, private readonly deps: ToolDeps, private readonly signal?: AbortSignal) {}

  /** One model call with the plan's first model, falling back through the registry. Throws ToolModelError when nothing answers. */
  async call(opts: { system: string; prompt: string; maxOutputTokens: number; modelIndex?: number }): Promise<string> {
    const model = this.deps.models[Math.min(opts.modelIndex ?? 0, this.deps.models.length - 1)];
    this.calls++;
    const params = sanitizeParams(model, { maxOutputTokens: opts.maxOutputTokens, reasoningEffort: "low" });
    const r = await this.deps.registry.generate({ model, prompt: opts.prompt, system: opts.system, classification: CLASSIFICATION, params, slot: "panel", signal: this.signal, avoid: new Set([model.id]) });
    if (!r.ok) throw new ToolModelError(r.message || "No model responded.", r.reason === "rate_limited");
    this.ok++;
    this.usd += spentUsd(r.model, r);
    this.model = r.model.name;
    return r.text;
  }

  /** The replies could not be used (unreadable output): the run is not charged, like a run with no response. */
  unusable() {
    this.ok = 0;
  }

  /**
   * Charge the ledger once for what the providers billed. Free is never charged; a run in which no model
   * answered is never charged. Returns the credits charged.
   */
  async settle(ws: Workspace, action: string): Promise<number> {
    if (this.settled) return 0;
    this.settled = true;
    if (ws.plan === "free" || this.ok === 0) return 0;
    const units = creditsForUsd(this.usd);
    if (units <= 0) return 0;
    // The stored cost carries the margin, like chat answers (settle.ts), so spend counters match the credits.
    await chargeUnits(ws, action, units, units * 0.002);
    return units;
  }
}

/**
 * Before any model is called: a request over the plan's per-request cost cap is refused, and the
 * allowance (monthly credits, 5-hour and weekly windows, Free pause, admin cap) must cover the estimate.
 * Free runs on $0 models, so only the pause applies.
 */
export async function preflight(ws: Workspace, estimateUsd: number) {
  if (ws.plan !== "free" && !ws.admin && overRequestCap(estimateUsd, limitsFor(ws.plan as LimitPlan), false)) {
    throw new HttpError(413, "That request is too large for your plan. Use less text or fewer slides.", "too_large");
  }
  await assertCanSpend(ws, ws.plan === "free" ? 0 : creditsForUsd(estimateUsd));
}

/** Aborts after `ms` or when the request is cancelled. */
export const deadline = (req: Request, ms: number) => AbortSignal.any([req.signal, AbortSignal.timeout(ms)]);

export function requireDeps(plan: ToolPlan): ToolDeps {
  const deps = toolDeps(plan);
  if (!deps) throw new HttpError(503, NOT_CONFIGURED, "not_configured");
  return deps;
}
