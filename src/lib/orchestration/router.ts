/**
 * Cost-aware router. Scores every routable model on
 * Quality × Reliability × Latency ÷ Cost for the classified task, then builds
 * the smallest plan that fits the complexity:
 *   simple   → one fast, cheap model; no verifier.
 *   moderate → a small panel from distinct families plus a cheap verifier.
 *   complex  → a wider independent panel, a cheap verifier, and a stronger
 *              judge that is only invoked if the panel disagrees.
 * Independence comes from mixing model families (the research notes that
 * temperature/logprob controls are disappearing on frontier APIs).
 */
import { FREE_SINGLE_PICK } from "./live-catalog";
import { catalog } from "./catalog";
import { toUnits } from "./compute";
import { PLAN_ALLOWANCES } from "./plans";
import { activeBoost } from "@/lib/learning/active";
import { isFreeModel } from "./free-guard";
import { acceptsImages, hasMedia, NO_FREE_VISION_MESSAGE, NO_VISION_MESSAGE } from "./media";
import { blendedPrice, callCostUsd } from "./pricing";
import type {
  Capability,
  Classification,
  ComputeEstimate,
  KeplarRequest,
  ModelSpec,
  RoutedModel,
  Router,
  RoutingPlan,
  RoutingPreferences,
} from "./types";

const CAP_TO_STRENGTH: Record<Capability, string[]> = {
  Reasoning: ["reasoning"],
  Research: ["long-context", "rag", "knowledge-work"],
  Coding: ["coding"],
  Finance: ["reasoning", "knowledge-work"],
  "Market Analysis": ["reasoning", "knowledge-work", "multilingual"],
  Writing: ["writing"],
  "Data Analysis": ["reasoning", "coding"],
  Risk: ["reasoning"],
  Regulatory: ["reasoning", "long-context", "sovereign-eu"],
  Verification: ["reasoning"],
  Creation: ["multimodal", "coding"],
  Planning: ["agentic", "tool-use", "computer-use"],
  Vision: ["multimodal"],
};

/**
 * Free plan panel cap. Every Free request draws on ONE shared OpenRouter key (20 requests/min, 50 or 1000/day for the whole
 * app), so a Free consensus answer is 2 panel models plus ONE combined review/write call (free-merged.ts): 3 requests, down
 * from 3 panel + extractor + reviewer + write-up (6-7). Paid plans keep their own panel sizes.
 */
export const FREE_MAX_PANEL = 2;

/** Free plan: $0 OpenRouter `:free` models only (free-guard.ts), no judge, no Deep Research. */
export function freeOnlyFor(req: KeplarRequest): boolean {
  return req.plan ? PLAN_ALLOWANCES[req.plan].models === "free-only" : false;
}

/**
 * Thrown when a request carries images or video frames and no routable model
 * accepts image input (e.g. every free vision model is gone). The orchestrator
 * turns it into a friendly message; nothing is sent.
 */
export class NoVisionModelError extends Error {
  constructor(readonly freePlan: boolean) {
    super(freePlan ? NO_FREE_VISION_MESSAGE : NO_VISION_MESSAGE);
  }
}

/** Models with unknown context windows are only trusted up to this size. */
const UNKNOWN_CONTEXT_CEILING = 128_000;

type Scored = { model: ModelSpec; score: number; price: number };

/**
 * A short, single-purpose "moderate" question (no attachments, media or Deep
 * Research) doesn't need a full panel. On paid plans with automatic routing it
 * gets two models and a cheap verifier instead of three. Cheaper, still checked.
 */
export function isLightModerate(c: Classification, req: Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">): boolean {
  if (c.complexity !== "moderate") return false;
  if (!["general", "writing", "factual"].includes(c.kind)) return false;
  if (req.attachments?.length || hasMedia(req.media) || req.modes?.deepResearch || req.modes?.web) return false;
  return req.prompt.trim().split(/\s+/).length <= 40;
}

function panelSize(c: Classification, prefs: RoutingPreferences, light = false): number {
  const base = c.complexity === "simple" ? 1 : c.complexity === "moderate" ? (light ? 2 : 3) : 5;
  const strategy = prefs.strategy ?? "auto";
  let n = base;
  if (strategy === "fast") n = c.complexity === "simple" ? 1 : Math.max(2, base - 2);
  if (strategy === "thorough") n = c.complexity === "simple" ? 3 : base + 1;
  const cap = Math.min(6, Math.max(1, prefs.maxModels ?? 6));
  return Math.min(n, cap);
}

export class CostAwareRouter implements Router {
  /**
   * `boost`: the learned multiplier on a model's score for this kind of question (src/lib/learning). It only reorders models that
   * already passed every filter below (free-only, vision, retention, context, price), so no guard can be loosened by it. It is
   * 1 until enough evidence exists, and bounded (0.8 to 1.3) whatever it holds.
   */
  constructor(
    private readonly models: readonly ModelSpec[] = catalog,
    private readonly boost: (tier: "free" | "paid", category: string, modelId: string) => number = activeBoost,
  ) {}

  /** `vision`: only models that accept image input (panel seats on media questions). */
  private eligible(c: Classification, req: KeplarRequest, vision = false): Scored[] {
    const at = req.at ?? new Date().toISOString();
    const prefs = req.routing ?? {};
    const exclude = new Set(prefs.excludeProviders ?? []);
    const wanted = new Set(c.capabilities.flatMap((cap) => CAP_TO_STRENGTH[cap]));
    const needed = c.estimatedInputTokens + c.estimatedOutputTokens;

    const cheapOnly = freeOnlyFor(req);
    return this.models.flatMap((m) => {
      if (!m.routable || exclude.has(m.family)) return [];
      // Media questions: panel seats go only to models that can see the images (catalog modalities).
      if (vision && !acceptsImages(m)) return [];
      // Free plan: $0 `:free` models only, never a judge (enforced here and again in the registry).
      if (cheapOnly && (m.role === "judge" || !isFreeModel(m))) return [];
      // The sensitive tier requires zero data retention; models that mandate retention can't serve it.
      if ((prefs.excludeProviderRetention || prefs.tier === "sensitive") && m.capabilities.requiresProviderRetention) return [];
      const window = m.contextWindow ?? UNKNOWN_CONTEXT_CEILING;
      if (needed > window) return [];
      const price = blendedPrice(m, at);
      if (price == null) return [];

      const match = m.strengths.filter((s) => wanted.has(s)).length;
      const quality = 1 + match * 0.5 + (m.role === "judge" ? 0.6 : m.role === "primary" ? 0.4 : m.role === "specialist" ? 0.3 : 0);
      const reliability = m.verified ? 1 : 0.55;
      const latency = m.strengths.includes("speed") ? 1.15 : m.capabilities.alwaysReasons ? 0.9 : 1;
      const openBoost = prefs.preferOpenWeights && m.openWeights ? 1.35 : 1;
      // Cost enters sub-linearly so quality still matters on complex work.
      const costWeight = c.complexity === "simple" ? 1 : c.complexity === "moderate" ? 0.55 : 0.35;
      const learned = this.boost(cheapOnly ? "free" : "paid", `${c.kind}:${c.complexity}`, m.id);
      const score = (quality * reliability * latency * openBoost * learned) / Math.pow(price + 0.05, costWeight);
      return [{ model: m, score, price }];
    });
  }

  route(c: Classification, req: KeplarRequest): RoutingPlan {
    const at = req.at ?? new Date().toISOString();
    const prefs = req.routing ?? {};
    const media = hasMedia(req.media);
    const cheapOnly = freeOnlyFor(req);
    // Panel: vision models only when images/frames are attached. The verifier and
    // judge read the panel's text answers, not the media, so any model may review.
    const pool = this.eligible(c, req, media).sort((a, b) => b.score - a.score);
    const reviewPool = media ? this.eligible(c, req).sort((a, b) => b.score - a.score) : pool;
    // Error-prone simple questions (counting, arithmetic, exact facts) get two models and a check, on every plan (free models cost $0).
    const checkOnly = Boolean(c.errorProne) && c.complexity === "moderate";
    const light = checkOnly || (!cheapOnly && (prefs.strategy ?? "auto") === "auto" && isLightModerate(c, req));
    const size = cheapOnly ? Math.min(FREE_MAX_PANEL, panelSize(c, prefs, checkOnly)) : panelSize(c, prefs, light);

    if (pool.length === 0) {
      if (media && reviewPool.length) throw new NoVisionModelError(cheapOnly);
      throw new Error("No eligible models for this request with the current routing preferences.");
    }

    // Single-model path: prefer the fast-cheap tier, fall back to anything.
    if (size === 1) {
      // Free plan: the models that benchmarked clean and fast on shared hosts come first (FREE_SINGLE_PICK); the fast-cheap
      // tier (Lightning stalls for 20-70 s, Nano Omni is capacity-limited) is only a last resort.
      const pick =
        (cheapOnly || pool.every((s) => isFreeModel(s.model)) ? FREE_SINGLE_PICK.map((id) => pool.find((s) => s.model.id === id)).find(Boolean) : undefined) ??
        pool.find((s) => s.model.role === "fast-cheap" && s.model.verified) ??
        pool.find((s) => s.model.role === "fast-cheap") ??
        pool[0];
      const panel: RoutedModel[] = [
        { model: pick.model, slot: "panel", covers: c.capabilities[0], reason: "Fastest capable model at the lowest cost for a simple request." },
      ];
      return {
        mode: "single",
        panel,
        verifier: null,
        judge: null,
        estimate: this.estimate(panel, null, null, c, at),
        rationale: c.rationale,
      };
    }

    // Panel: best-scoring models from distinct families. Judges are held back.
    const panel: RoutedModel[] = [];
    const families = new Set<string>();
    // Free plans draw the panel from the fast tier too (it's all they can use).
    const panelPool = pool.filter((s) => s.model.role !== "judge" && (cheapOnly || s.model.role !== "fast-cheap"));
    const caps = c.capabilities.filter((x) => x !== "Verification");
    for (const s of panelPool) {
      if (panel.length >= size) break;
      if (families.has(s.model.family)) continue;
      // Keep one slot for an open-weight family when the panel is wide: their
      // training differs most from the US labs (research §5, a hypothesis).
      const slotsLeft = size - panel.length;
      const hasOpen = panel.some((p) => p.model.openWeights);
      if (size >= 4 && slotsLeft === 1 && !hasOpen && !s.model.openWeights) continue;
      families.add(s.model.family);
      const covers = caps[panel.length % Math.max(1, caps.length)];
      panel.push({ model: s.model, slot: "panel", covers, reason: `Strong on ${covers?.toLowerCase() ?? "this task"} at its price.` });
    }
    // If the family constraint left us short, relax it.
    for (const s of panelPool) {
      if (panel.length >= size) break;
      if (panel.some((p) => p.model.id === s.model.id)) continue;
      panel.push({ model: s.model, slot: "panel", covers: caps[panel.length % Math.max(1, caps.length)], reason: "Added to reach the panel size." });
    }

    // Verifier: the cheapest verified model outside the panel, ideally another family.
    const verifierPick = reviewPool
      .filter((s) => !panel.some((p) => p.model.id === s.model.id))
      .filter((s) => s.model.role === "fast-cheap" || s.model.role === "verifier")
      .sort((a, b) => Number(b.model.verified) - Number(a.model.verified) || Number(families.has(a.model.family)) - Number(families.has(b.model.family)) || a.price - b.price)[0];
    const verifier: RoutedModel | null = verifierPick
      ? { model: verifierPick.model, slot: "verifier", covers: "Verification", reason: "Checks individual claims cheaply." }
      : null;

    // Judge: only for complex work; a family outside the panel to limit self-preference.
    let judge: RoutedModel | null = null;
    if (!cheapOnly && c.complexity === "complex" && (prefs.strategy ?? "auto") !== "fast") {
      const judges = reviewPool.filter((s) => s.model.role === "judge");
      const pick = judges.find((s) => !families.has(s.model.family)) ?? judges[0];
      if (pick) judge = { model: pick.model, slot: "judge", reason: "Evaluates reasoning and evidence if the panel disagrees." };
    }

    return {
      mode: "consensus",
      panel,
      verifier,
      judge,
      estimate: this.estimate(panel, verifier, judge, c, at),
      rationale: c.rationale,
    };
  }

  private estimate(
    panel: RoutedModel[],
    verifier: RoutedModel | null,
    judge: RoutedModel | null,
    c: Classification,
    at: string,
  ): ComputeEstimate {
    const breakdown: ComputeEstimate["breakdown"] = [];
    const inTok = c.estimatedInputTokens;
    const outTok = c.estimatedOutputTokens;
    for (const p of panel) {
      breakdown.push({ modelId: p.model.id, slot: "panel", usd: callCostUsd(p.model, inTok, outTok, at) ?? 0 });
    }
    // The verifier reads every panel answer; the judge reads them plus the verifier notes.
    const reviewIn = inTok + outTok * panel.length;
    if (verifier) breakdown.push({ modelId: verifier.model.id, slot: "verifier", usd: callCostUsd(verifier.model, reviewIn, 600, at) ?? 0 });
    if (judge) breakdown.push({ modelId: judge.model.id, slot: "judge", usd: callCostUsd(judge.model, reviewIn + 800, 900, at) ?? 0, conditional: true });
    // Estimate assumes the judge runs (worst case) so the allowance check is conservative.
    const usd = breakdown.reduce((a, b) => a + b.usd, 0);
    return { usd, units: toUnits(usd), breakdown };
  }
}
