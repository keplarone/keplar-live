/**
 * Price-table ESTIMATES of one use of each feature (not measured). Built from the live roster's list prices and typical call
 * shapes, so the dashboard and docs have a starting table before real traffic accrues. Measured averages replace these.
 */
import { LIVE_SEEDS } from "@/lib/orchestration/live-catalog";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { COST_ESTIMATES_USD, USD_PER_UNIT } from "@/lib/create/platform/compute";
import { HF_MODELS } from "@/lib/higgsfield/catalog";
import type { FeatureId } from "./features";
import { UNIT_PRICES } from "./usage";

type Shape = { calls: number; inTok: number; outTok: number };
const paidSeeds = LIVE_SEEDS.filter((s) => s.inputPer1M > 0 || s.outputPer1M > 0);
const avg = (k: "inputPer1M" | "outputPer1M") => (paidSeeds.length ? paidSeeds.reduce((t, s) => t + s[k], 0) / paidSeeds.length : 1);
/** Blended live-roster list price (USD per 1M tokens). */
export const BLENDED = { in: avg("inputPer1M"), out: avg("outputPer1M") };
const cheapest = paidSeeds.slice().sort((a, b) => a.inputPer1M + a.outputPer1M - (b.inputPer1M + b.outputPer1M))[0];
const CHEAP = { in: cheapest?.inputPer1M ?? 0.05, out: cheapest?.outputPer1M ?? 0.4 };

const tok = (shapes: Shape[], price = BLENDED) => shapes.reduce((t, s) => t + (s.calls * (s.inTok * price.in + s.outTok * price.out)) / 1e6, 0);
const credits = (usd: number) => (usd <= 0 ? 0 : Math.max(1, Math.ceil((usd * METER_MARGIN) / USD_PER_UNIT)));

export type Estimate = { feature: FeatureId; assumption: string; paidUsd: number; credits: number };

export function estimateTable(): Estimate[] {
  const ask = tok([{ calls: 5, inTok: 2_000, outTok: 700 }, { calls: 2, inTok: 3_000, outTok: 300 }, { calls: 1, inTok: 6_000, outTok: 1_000 }]);
  const seed = HF_MODELS.find((m) => m.default && m.kind === "video");
  const rows: [FeatureId, string, number][] = [
    ["ask", "5-model panel (2k in / 700 out) + 2 verifier + 1 judge, blended roster price", ask],
    ["debate", "Two rounds of the panel + judge (~2× Ask)", ask * 2],
    ["deep-research", "~25 calls of 6k in / 1.2k out (search, read, synthesize)", tok([{ calls: 25, inTok: 6_000, outTok: 1_200 }])],
    ["core-reasoning", "Thorough routing: ~1.5× Ask", ask * 1.5],
    ["multimodal", "Ask + 2 images (~1.5k image tokens each)", ask + tok([{ calls: 5, inTok: 3_000, outTok: 0 }])],
    ["study", "Set generation: 1 call of 8k in / 4k out", tok([{ calls: 1, inTok: 8_000, outTok: 4_000 }])],
    ["slides", "Deck: 3 calls of 6k in / 5k out", tok([{ calls: 3, inTok: 6_000, outTok: 5_000 }])],
    ["create", "Site/app generation (catalog estimate site.generate)", COST_ESTIMATES_USD["site.generate"]],
    ["critic", "QA critique: 2 vision calls of 12k in / 1k out", tok([{ calls: 2, inTok: 12_000, outTok: 1_000 }])],
    ["images", "1 image, GPT Image 2 default quality", UNIT_PRICES.imageByModel["openai/gpt-image-2"]],
    ["video", `5 s ${seed?.label ?? "Seedance"} at list $${(seed?.listUsd ?? 0.14).toFixed(4)}/s`, (seed?.listUsd ?? 0.1407) * 5],
    ["transcribe", "1 minute of audio (speech-to-text)", UNIT_PRICES.audioPerMinuteUsd],
    ["voice-create", "1 min transcription + one Create edit (site.iterate)", UNIT_PRICES.audioPerMinuteUsd + COST_ESTIMATES_USD["site.iterate"]],
    ["agents", "One agent step (catalog agent.step)", COST_ESTIMATES_USD["agent.step"]],
    ["api", "Single-model answer, 2k in / 700 out", tok([{ calls: 1, inTok: 2_000, outTok: 700 }])],
    ["embed", "Single-model answer, 2k in / 700 out", tok([{ calls: 1, inTok: 2_000, outTok: 700 }])],
    ["deploy", "Static build + upload (catalog site.deploy)", COST_ESTIMATES_USD["site.deploy"]],
    ["memory", "Memory extraction: 1 cheap call, 2k in / 300 out", tok([{ calls: 1, inTok: 2_000, outTok: 300 }], CHEAP)],
    ["title", "Chat title: 1 cheap call, 500 in / 20 out", tok([{ calls: 1, inTok: 500, outTok: 20 }], CHEAP)],
  ];
  return rows.map(([feature, assumption, usd]) => ({ feature, assumption, paidUsd: Math.round(usd * 1e5) / 1e5, credits: credits(usd) }));
}
