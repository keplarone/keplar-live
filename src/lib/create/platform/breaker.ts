/**
 * Global circuit breaker on total provider spend for the UTC day.
 *
 * Ratio = today's total spend (system_daily_spend, same counter as the Free pause) / KEPLAR_GLOBAL_DAILY_USD_CAP.
 *   normal   below 70%   nothing changes
 *   cheap    from 70%    new Create/site jobs use cheaper models (answers keep their routing)
 *   no_media from 85%    paid media (images, video) pauses; cheaper models stay
 *   capped   from 100%   Free pauses (spend.ts) and new paid image/video stay paused; paid text keeps working on the cheapest model
 * Thresholds: KEPLAR_BREAKER_CHEAP_AT and KEPLAR_BREAKER_MEDIA_AT (shares of the cap).
 */
import { caps, spendToday } from "./spend";

export type BreakerLevel = "normal" | "cheap" | "no_media" | "capped";

export function breakerThresholds() {
  const n = (k: string, d: number) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : d;
  };
  const cheap = n("KEPLAR_BREAKER_CHEAP_AT", 0.7);
  const media = Math.max(cheap, n("KEPLAR_BREAKER_MEDIA_AT", 0.85));
  return { cheap, media };
}

export function levelFor(totalUsd: number, capUsd: number): BreakerLevel {
  if (!(capUsd > 0)) return "normal";
  const r = totalUsd / capUsd;
  const t = breakerThresholds();
  return r >= 1 ? "capped" : r >= t.media ? "no_media" : r >= t.cheap ? "cheap" : "normal";
}

export async function breakerLevel(): Promise<BreakerLevel> {
  if (process.env.KEPLAR_BREAKER_FORCE) {
    const f = process.env.KEPLAR_BREAKER_FORCE as BreakerLevel;
    if (["normal", "cheap", "no_media", "capped"].includes(f)) return f;
  }
  try {
    const d = await spendToday();
    return levelFor(d.totalUsd, caps().globalUsd);
  } catch {
    return "normal"; // a store hiccup must not block everyone
  }
}

export const useCheaperModels = (l: BreakerLevel) => l !== "normal";
export const paidMediaPaused = (l: BreakerLevel) => l === "no_media" || l === "capped";

export const BREAKER_NOTICE: Record<BreakerLevel, string | null> = {
  normal: null,
  cheap: "Demand is high today, so new builds use lighter models.",
  no_media: "Demand is high today. Image and video generation is paused until 00:00 UTC; builds use lighter models.",
  capped: "Keplar has reached today's usage budget. Image and video generation is paused until 00:00 UTC.",
};
