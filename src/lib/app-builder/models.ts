/**
 * Model strategy for Keplar Apps, per plan and per job. Free uses only $0 `:free` OpenRouter models (checked against the live
 * catalog on Oct 6, 2026). Paid plans use the strongest coding models we can afford inside the plan's per-job cap; the global
 * circuit breaker steps paid plans down one tier. Prices are OpenRouter list prices per 1M tokens (Oct 6, 2026).
 */
import type { BreakerLevel } from "@/lib/create/platform/breaker";
import type { PlanId } from "@/lib/create/platform/plans";

export type AppModel = { id: string; label: string; inPer1M: number; outPer1M: number; free: boolean; maxOut: number; vision?: boolean };
const M = (id: string, label: string, inPer1M: number, outPer1M: number, maxOut: number, vision = false): AppModel => ({ id, label, inPer1M, outPer1M, free: id.endsWith(":free"), maxOut, vision });

export const APP_MODELS = {
  freeUltra: M("nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra (free)", 0, 0, 32_000),
  freeSuper: M("nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super (free)", 0, 0, 32_000),
  freeGemma: M("google/gemma-4-31b-it:free", "Gemma 4 31B (free)", 0, 0, 16_000, true),
  freeLaguna: M("poolside/laguna-s-2.1:free", "Laguna S 2.1 (free)", 0, 0, 32_000),
  freeOmni: M("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "Nemotron Nano Omni (free)", 0, 0, 8_000, true),
  flash: M("google/gemini-3.8-flash", "Gemini 3.8 Flash", 0.75, 3.75, 64_000, true),
  qwenFlash: M("qwen/qwen3.8-flash", "Qwen 3.8 Flash", 0.15, 0.47, 32_000),
  deepseek: M("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", 0.21, 0.42, 32_000),
  sonnet: M("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", 2, 10, 64_000, true),
  opus: M("anthropic/claude-opus-5.5", "Claude Opus 5.5", 4, 20, 64_000, true),
} as const;

export type Job = "plan" | "code" | "fix" | "vision" | "design" | "runtime-fast" | "runtime-smart";

const FREE_TEXT = [APP_MODELS.freeUltra, APP_MODELS.freeSuper, APP_MODELS.freeLaguna, APP_MODELS.freeGemma];
const FREE_VISION = [APP_MODELS.freeGemma, APP_MODELS.freeOmni];

/** Models to try in order. Free plan: free models only, always. */
export function chainFor(plan: PlanId, job: Job, breaker: BreakerLevel = "normal"): AppModel[] {
  if (plan === "free") return job === "vision" ? FREE_VISION : FREE_TEXT;
  const stepped = breaker !== "normal";
  const top = plan === "pro" || plan === "business" ? APP_MODELS.opus : plan === "plus" ? APP_MODELS.sonnet : APP_MODELS.flash;
  const coder = stepped ? (top === APP_MODELS.opus ? APP_MODELS.sonnet : APP_MODELS.flash) : top;
  switch (job) {
    case "plan":
      return plan === "lite" || stepped ? [APP_MODELS.flash, APP_MODELS.deepseek, APP_MODELS.freeUltra] : [APP_MODELS.sonnet, APP_MODELS.flash, APP_MODELS.freeUltra];
    case "code":
    case "fix":
      return [coder, ...(coder === APP_MODELS.flash ? [APP_MODELS.deepseek] : [APP_MODELS.flash]), APP_MODELS.freeUltra];
    case "vision":
      return [APP_MODELS.flash, APP_MODELS.freeGemma];
    case "design":
      return [APP_MODELS.flash, APP_MODELS.freeUltra];
    case "runtime-fast":
      return [APP_MODELS.qwenFlash, APP_MODELS.flash];
    case "runtime-smart":
      return plan === "pro" || plan === "business" ? [APP_MODELS.sonnet, APP_MODELS.flash] : [APP_MODELS.flash, APP_MODELS.qwenFlash];
  }
}

/** The end-user AI proxy for apps whose creator is on Free: free models only (metered at $0, still rate limited). */
export const runtimeChain = (plan: PlanId, tier: "fast" | "smart"): AppModel[] => (plan === "free" ? [APP_MODELS.freeSuper, APP_MODELS.freeUltra, APP_MODELS.freeGemma] : chainFor(plan, tier === "smart" ? "runtime-smart" : "runtime-fast"));

export const priceOf = (m: Pick<AppModel, "inPer1M" | "outPer1M">, inTok: number, outTok: number) => (inTok * m.inPer1M + outTok * m.outPer1M) / 1_000_000;

/** Per-plan budgets for one app build (all model calls of the pipeline together). */
export type AppBuildLimits = { maxBuildUsd: number; maxFiles: number; maxBytes: number; maxPages: number; fixAttempts: number; visualPass: boolean; images: number; outTokensPerCall: number; parallel: number; collections: number; ai: boolean; backend: boolean };
export const APP_BUILD_LIMITS: Record<PlanId, AppBuildLimits> = {
  free: { maxBuildUsd: 0, maxFiles: 8, maxBytes: 160_000, maxPages: 4, fixAttempts: 1, visualPass: false, images: 0, outTokensPerCall: 16_000, parallel: 2, collections: 0, ai: false, backend: false },
  lite: { maxBuildUsd: 0.6, maxFiles: 12, maxBytes: 260_000, maxPages: 6, fixAttempts: 2, visualPass: true, images: 0, outTokensPerCall: 20_000, parallel: 5, collections: 4, ai: false, backend: true },
  plus: { maxBuildUsd: 2.5, maxFiles: 20, maxBytes: 480_000, maxPages: 10, fixAttempts: 2, visualPass: true, images: 3, outTokensPerCall: 24_000, parallel: 8, collections: 10, ai: true, backend: true },
  pro: { maxBuildUsd: 6, maxFiles: 30, maxBytes: 800_000, maxPages: 16, fixAttempts: 3, visualPass: true, images: 5, outTokensPerCall: 32_000, parallel: 10, collections: 16, ai: true, backend: true },
  business: { maxBuildUsd: 10, maxFiles: 40, maxBytes: 1_200_000, maxPages: 24, fixAttempts: 3, visualPass: true, images: 6, outTokensPerCall: 32_000, parallel: 12, collections: 24, ai: true, backend: true },
};
