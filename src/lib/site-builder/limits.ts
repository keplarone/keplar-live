/**
 * Site builder limits and models, by plan. One place to change them.
 * Free: text-only, free ($0) models, tight caps. Plus/Pro: stronger paid models, metered through the
 * existing Usage ledger (1 credit = $0.002 of provider cost x 1.1 margin) and the 5-hour / weekly windows.
 */
import { toUnits } from "@/lib/create/platform/compute";
import { meteredUsd } from "@/lib/orchestration/limits";
import type { BreakerLevel } from "@/lib/create/platform/breaker";
import type { PlanId } from "@/lib/create/platform/plans";

export type BuilderLimits = {
  promptChars: number;
  /** Pages (html files) per site. */
  pages: number;
  /** Total stored bytes of one version. */
  siteBytes: number;
  /** AI jobs per rolling 24 h. */
  jobsPerDay: number;
  /** AI jobs per minute. */
  jobsPerMin: number;
  /** Builds running at once. */
  concurrent: number;
  /** Output token ceiling for one job. */
  maxOutputTokens: number;
  /** Chat turns kept in the thread. */
  chatKept: number;
  /** Versions kept per site (older ones are dropped). */
  versionsKept: number;
  /** Leads stored per site. */
  leadsKept: number;
  /** Max estimated charged USD of one job; bigger jobs are refused (mirrors the /app per-request cap). */
  maxJobUsd: number;
};

export const BUILDER_LIMITS: Record<PlanId, BuilderLimits> = {
  free: { promptChars: 1_500, pages: 4, siteBytes: 70_000, jobsPerDay: 8, jobsPerMin: 2, concurrent: 1, maxOutputTokens: 14_000, chatKept: 30, versionsKept: 12, leadsKept: 200, maxJobUsd: 0 },
  lite: { promptChars: 2_500, pages: 5, siteBytes: 100_000, jobsPerDay: 20, jobsPerMin: 3, concurrent: 1, maxOutputTokens: 18_000, chatKept: 40, versionsKept: 15, leadsKept: 500, maxJobUsd: 0.3 },
  plus: { promptChars: 4_000, pages: 8, siteBytes: 160_000, jobsPerDay: 60, jobsPerMin: 4, concurrent: 2, maxOutputTokens: 22_000, chatKept: 60, versionsKept: 30, leadsKept: 2_000, maxJobUsd: 0.75 },
  pro: { promptChars: 8_000, pages: 15, siteBytes: 280_000, jobsPerDay: 150, jobsPerMin: 6, concurrent: 3, maxOutputTokens: 32_000, chatKept: 80, versionsKept: 50, leadsKept: 10_000, maxJobUsd: 1.5 },
  business: { promptChars: 8_000, pages: 25, siteBytes: 400_000, jobsPerDay: 300, jobsPerMin: 8, concurrent: 4, maxOutputTokens: 32_000, chatKept: 80, versionsKept: 50, leadsKept: 20_000, maxJobUsd: 2 },
};

export type BuilderModel = {
  id: string;
  label: string;
  /** USD per 1M tokens, OpenRouter list price (checked 2026-10-02). */
  inPer1M: number;
  outPer1M: number;
  free: boolean;
};

const M = (id: string, label: string, inPer1M: number, outPer1M: number): BuilderModel => ({ id, label, inPer1M, outPer1M, free: id.endsWith(":free") });

export const MODELS = {
  freeA: M("nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra (free)", 0, 0),
  freeB: M("nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super (free)", 0, 0),
  freeC: M("google/gemma-4-31b-it:free", "Gemma 4 31B (free)", 0, 0),
  cheap: M("deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", 0.02, 0.6),
  plus: M("google/gemini-3.8-flash", "Gemini 3.8 Flash", 0.75, 3.75),
  pro: M("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", 2, 10),
} as const;

/** Models to try, in order, for a plan. The global circuit breaker steps paid plans down to cheaper ones. */
export function modelChain(plan: PlanId, breaker: BreakerLevel = "normal"): BuilderModel[] {
  if (plan === "free") return [MODELS.freeA, MODELS.freeB, MODELS.freeC];
  const stepped = breaker !== "normal";
  // Lite matches Plus: Flash first. Pro and Business keep Sonnet. A breaker steps every paid plan down.
  if (plan === "plus" || plan === "lite" || stepped) return [stepped ? MODELS.cheap : MODELS.plus, MODELS.cheap, MODELS.freeB];
  return [MODELS.pro, MODELS.plus, MODELS.cheap];
}

export type JobKind = "build" | "edit";

export type Estimate = {
  kind: JobKind;
  model: string;
  modelLabel: string;
  free: boolean;
  /** Credits the job is expected to use (with the 1.1 margin). 0 on Free. */
  units: number;
  low: number;
  high: number;
  /** Rough size of the model's reply, tokens. */
  outputTokens: number;
};

/** ~3.4 chars per token for HTML/CSS. */
export const tokensOf = (chars: number) => Math.ceil(chars / 3.4);
const SYSTEM_TOKENS = 3_000;

export function costUsd(m: Pick<BuilderModel, "inPer1M" | "outPer1M">, inTok: number, outTok: number) {
  return (inTok * m.inPer1M + outTok * m.outPer1M) / 1_000_000;
}

/** Credits for a charged-USD amount (margin included once). */
export const creditsFor = (providerUsd: number) => (providerUsd > 0 ? toUnits(meteredUsd(providerUsd)) : 0);

export function estimateJob(opts: { plan: PlanId; breaker?: BreakerLevel; promptChars: number; siteChars: number; hasSite: boolean }): Estimate {
  const L = BUILDER_LIMITS[opts.plan];
  const model = modelChain(opts.plan, opts.breaker)[0];
  const kind: JobKind = opts.hasSite ? "edit" : "build";
  const siteTok = tokensOf(opts.siteChars);
  const inTok = SYSTEM_TOKENS + tokensOf(opts.promptChars) + (opts.hasSite ? siteTok : 0);
  const base = Math.min(L.maxOutputTokens, opts.plan === "free" ? 8_000 : opts.plan === "plus" ? 12_000 : 16_000);
  const outTok = opts.hasSite ? Math.min(base, Math.max(2_500, Math.round(siteTok * 0.6) + 800)) : base;
  const usd = costUsd(model, inTok, outTok);
  return {
    kind,
    model: model.id,
    modelLabel: model.label,
    free: model.free,
    units: model.free ? 0 : creditsFor(usd),
    low: model.free ? 0 : creditsFor(usd * 0.5),
    // High end includes the one quality-repair pass a new build may need.
    high: model.free ? 0 : creditsFor(costUsd(model, inTok, L.maxOutputTokens) * (opts.hasSite ? 1 : 1.35)),
    outputTokens: outTok,
  };
}

/** Ask for confirmation before a job expected to use more than this many credits (about $0.24). */
export const CONFIRM_UNITS = 120;
export const confirmUnits = () => {
  const n = Number(process.env.KEPLAR_SITE_CONFIRM_UNITS);
  return Number.isFinite(n) && n >= 0 && process.env.KEPLAR_SITE_CONFIRM_UNITS ? n : CONFIRM_UNITS;
};
