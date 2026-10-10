/**
 * Per-plan usage limits and the metering margin. Pure (no fs, no network), so
 * the route, the engine and the tests share one set of numbers.
 *
 * Money model (docs/cost-model.md): 1 credit = 1 Usage unit = $0.002 of
 * provider cost. Plus ($45) = 6,000 credits = $12 of model cost; Pro ($99) =
 * 13,500 credits = $27. The rest of the price covers payment fees, hosting and
 * margin. Everything here exists so one user (or one bug) cannot spend more
 * than the plan pays for.
 */
import type { KeplarRequest } from "./types";

export type LimitPlan = "free" | "lite" | "plus" | "pro" | "business";

/**
 * Safety margin on metered cost. Every answer is charged at 110% of the
 * provider cost we measured or estimated (token-priced when a provider reports
 * no cost), so price drift and rounding never leave us under-charging.
 */
export const METER_MARGIN = 1.1;

export type PlanLimits = {
  /** Questions per minute per user (per browser/IP when signed out). */
  burstPerMin: number;
  /** Questions per rolling 24 hours per user (Free: also per browser cookie). */
  dailyRequests: number;
  /** Questions per rolling 24 hours per IP (shared networks get more than one person's share). */
  dailyIpRequests: number;
  /** Questions running at the same time. */
  concurrent: number;
  maxPromptChars: number;
  /** Prior turns sent along for context, total characters (oldest are dropped). */
  maxHistoryChars: number;
  maxAttachments: number;
  /** All attached files together, bytes (as reported by the browser). */
  maxAttachmentBytes: number;
  maxImages: number;
  /** Ceiling on the estimated cost of one question, USD (0 = Free, which never spends). */
  maxRequestUsd: number;
  /** Same, for a Deep Research run. */
  maxDeepResearchUsd: number;
  /** Provider spend per UTC day for this user, USD (null = not applicable). */
  dailyUsd: number | null;
  /** Questions per UTC day that may use a full multi-model panel (3+ models). After that the plan still answers, with at most 2 models (src/lib/orchestration/fanout.ts). */
  dailyFanoutRuns: number;
  /** Free only: provider requests per UTC day for this person (a question can cost several; usage/call-budget.ts). null = not applied. */
  dailyProviderCalls: number | null;
};

const MB = 1024 * 1024;

export const PLAN_LIMITS: Record<LimitPlan, PlanLimits> = {
  free: { burstPerMin: 6, dailyRequests: 50, dailyIpRequests: 150, concurrent: 2, maxPromptChars: 6_000, maxHistoryChars: 12_000, maxAttachments: 3, maxAttachmentBytes: 10 * MB, maxImages: 2, maxRequestUsd: 0, maxDeepResearchUsd: 0, dailyUsd: null, dailyFanoutRuns: 50, dailyProviderCalls: 150 },
  lite: { burstPerMin: 8, dailyRequests: 150, dailyIpRequests: 400, concurrent: 2, maxPromptChars: 10_000, maxHistoryChars: 24_000, maxAttachments: 4, maxAttachmentBytes: 15 * MB, maxImages: 3, maxRequestUsd: 0.3, maxDeepResearchUsd: 0, dailyUsd: 1.2, dailyFanoutRuns: 60, dailyProviderCalls: null },
  plus: { burstPerMin: 10, dailyRequests: 300, dailyIpRequests: 600, concurrent: 3, maxPromptChars: 12_000, maxHistoryChars: 30_000, maxAttachments: 6, maxAttachmentBytes: 25 * MB, maxImages: 4, maxRequestUsd: 0.75, maxDeepResearchUsd: 3.5, dailyUsd: 3, dailyFanoutRuns: 150, dailyProviderCalls: null },
  pro: { burstPerMin: 20, dailyRequests: 600, dailyIpRequests: 1_200, concurrent: 4, maxPromptChars: 16_000, maxHistoryChars: 40_000, maxAttachments: 10, maxAttachmentBytes: 25 * MB, maxImages: 4, maxRequestUsd: 1.5, maxDeepResearchUsd: 5, dailyUsd: 7, dailyFanoutRuns: 300, dailyProviderCalls: null },
  business: { burstPerMin: 30, dailyRequests: 1_000, dailyIpRequests: 2_000, concurrent: 5, maxPromptChars: 16_000, maxHistoryChars: 40_000, maxAttachments: 10, maxAttachmentBytes: 50 * MB, maxImages: 4, maxRequestUsd: 2, maxDeepResearchUsd: 5, dailyUsd: 150, dailyFanoutRuns: 600, dailyProviderCalls: null },
};

export const limitsFor = (plan: LimitPlan): PlanLimits => PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

/** Credits (units) charged for a provider cost, including the safety margin. */
export const meteredUsd = (usd: number): number => Math.max(0, usd) * METER_MARGIN;

/** Shortens prior turns to the plan's budget, keeping the most recent ones. */
export function clampHistory(history: NonNullable<KeplarRequest["history"]>, maxChars: number): NonNullable<KeplarRequest["history"]> {
  const out: NonNullable<KeplarRequest["history"]> = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const room = maxChars - total;
    if (room <= 0) break;
    const text = history[i].text.length > room ? history[i].text.slice(0, room) : history[i].text;
    out.push({ ...history[i], text });
    total += text.length;
  }
  return out.reverse();
}

/** A user-facing message when the request is over the plan's size caps, else null. */
export function sizeProblem(req: Pick<KeplarRequest, "prompt" | "attachments" | "media">, limits: PlanLimits, plan: LimitPlan): string | null {
  const upgrade = plan === "free" ? " Plus raises these limits." : "";
  if (req.prompt.length > limits.maxPromptChars) return `That message is too long for your plan (up to ${limits.maxPromptChars.toLocaleString("en-US")} characters). Shorten it and try again.${upgrade}`;
  // Read links and media transcripts are listed with the attachments but are not files (they have their own caps).
  const files = (req.attachments ?? []).filter((a) => a.type !== "text/uri-list" && a.type !== "text/x-transcript");
  if (files.length > limits.maxAttachments) return `Your plan allows up to ${limits.maxAttachments} attachments per message.${upgrade}`;
  if (files.reduce((a, f) => a + f.size, 0) > limits.maxAttachmentBytes) return `The attachments are over ${Math.round(limits.maxAttachmentBytes / (1024 * 1024))} MB in total. Remove one or use a smaller file.${upgrade}`;
  if ((req.media?.images.length ?? 0) > limits.maxImages) return `Your plan allows up to ${limits.maxImages} images per message.${upgrade}`;
  return null;
}

/** True when one question's estimated cost (with the margin) is over the plan's per-request cap. */
export function overRequestCap(estimateUsd: number, limits: Pick<PlanLimits, "maxRequestUsd" | "maxDeepResearchUsd">, deepResearch: boolean): boolean {
  const cap = deepResearch ? limits.maxDeepResearchUsd : limits.maxRequestUsd;
  return cap > 0 && meteredUsd(estimateUsd) > cap;
}

export const REQUEST_TOO_BIG = "That's a lot for a single question. Shorten it, remove attachments, or turn off Deep Research, then try again.";
