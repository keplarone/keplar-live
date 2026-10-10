/**
 * Image generation: model, prices, sizes and per-plan limits. One place to change them.
 *
 * Model: OpenAI `gpt-image-1-mini` (Image API, POST /v1/images/generations), the cheapest GPT-image model that is still
 * good enough for site art. Published per-image prices (developers.openai.com/api/docs/models/gpt-image-1-mini, checked 2026-10-02):
 *   low    1024x1024 $0.005   1024x1536 / 1536x1024 $0.006
 *   medium 1024x1024 $0.011   1024x1536 / 1536x1024 $0.015
 *   high   1024x1024 $0.036   1024x1536 / 1536x1024 $0.052
 * `high` is the default (sharpest detail, ~3.3–3.5x the Standard price); the model's largest output is 1536 px on the long edge,
 * there is no larger size to offer (a bigger model would cost 4x+ per image). The default shape is Wide (1536x1024).
 * Billing is by tokens (output image $8 / 1M, text input $2 / 1M); a high 1536x1024 image is ~6,200 output tokens = $0.050.
 * The real cost is computed from the `usage` the API returns, never more than 3x the table price.
 * Images are requested as PNG (lossless) and stored and served byte for byte: no re-encoding anywhere.
 * Users see credits (1 credit = $0.002 of provider cost x 1.1 margin), never dollars.
 */
import { toUnits } from "@/lib/create/platform/compute";
import type { PlanId } from "@/lib/create/platform/plans";
import { meteredUsd } from "@/lib/orchestration/limits";
import { defaultHfModel, hfModel, hfModels, listPriceUsd } from "@/lib/higgsfield/catalog";
import { higgsfieldConfigured } from "@/lib/higgsfield/client";

export const IMAGE_MODEL = "gpt-image-1-mini";
export const IMAGE_VENDOR = "openai";

export type ImageQuality = "low" | "medium" | "high";
export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export const QUALITIES: { id: ImageQuality; label: string; note: string }[] = [
  { id: "high", label: "High", note: "Sharpest detail, about 3.5x the Standard price" },
  { id: "medium", label: "Standard", note: "Good for most pages" },
  { id: "low", label: "Draft", note: "Cheapest, simpler detail" },
];
export const SIZES: { id: ImageSize; label: string; width: number; height: number }[] = [
  { id: "1536x1024", label: "Wide", width: 1536, height: 1024 },
  { id: "1024x1024", label: "Square", width: 1024, height: 1024 },
  { id: "1024x1536", label: "Tall", width: 1024, height: 1536 },
];
export const DEFAULT_QUALITY: ImageQuality = "high";
export const DEFAULT_SIZE: ImageSize = "1536x1024";

/** Published price per image, USD. The estimate shown before a job is built from this. */
export const PRICE_USD: Record<ImageQuality, Record<ImageSize, number>> = {
  low: { "1024x1024": 0.005, "1536x1024": 0.006, "1024x1536": 0.006 },
  medium: { "1024x1024": 0.011, "1536x1024": 0.015, "1024x1536": 0.015 },
  high: { "1024x1024": 0.036, "1536x1024": 0.052, "1024x1536": 0.052 },
};
/** USD per token (gpt-image-1-mini). */
export const TOKEN_USD = { textIn: 2 / 1e6, imageIn: 2.5 / 1e6, imageOut: 8 / 1e6 };

/** Lossless, exactly what the model produced (a High 1536x1024 PNG is ~3.2 MB). */
export const OUTPUT_FORMAT = "png";
/** One stored image never exceeds this. Kept under Vercel's 4.5 MB function response limit so every image can be served and downloaded. */
export const MAX_IMAGE_BYTES = 4_300_000;

export type ImageLimits = {
  /** Images per rolling 24 h (started jobs that were not refused). */
  perDay: number;
  /** Of those, how many may be High quality (the expensive tier). */
  highPerDay: number;
  perMin: number;
  /** Jobs running at once. */
  concurrent: number;
  promptChars: number;
  /** Stored images and bytes per account. */
  storedImages: number;
  storedBytes: number;
};

/** Free has no paid media. Admin is exempt from the daily image count only (the $25/day admin cap and every breaker still apply). */
export const IMAGE_LIMITS: Record<PlanId, ImageLimits | null> = {
  free: null,
  lite: null,
  plus: { perDay: 15, highPerDay: 6, perMin: 3, concurrent: 1, promptChars: 600, storedImages: 80, storedBytes: 250_000_000 },
  pro: { perDay: 40, highPerDay: 16, perMin: 4, concurrent: 2, promptChars: 1_000, storedImages: 200, storedBytes: 600_000_000 },
  business: { perDay: 80, highPerDay: 32, perMin: 6, concurrent: 3, promptChars: 1_000, storedImages: 400, storedBytes: 1_200_000_000 },
};

export const FREE_UPGRADE_MESSAGE = "Image generation is part of Keplar Plus and Pro, because every image costs real money to make. Upgrade to create images.";

export const imageLimitsFor = (plan: PlanId) => IMAGE_LIMITS[plan];

export const isSize = (v: unknown): v is ImageSize => SIZES.some((s) => s.id === v);
export const isQuality = (v: unknown): v is ImageQuality => QUALITIES.some((q) => q.id === v);

export type ImageEstimate = { units: number; usd: number; quality: ImageQuality; size: ImageSize };

/** Upper-bound estimate: the published price, with the metering margin, in credits. */
export function estimateImage(quality: ImageQuality, size: ImageSize, withReference = false, modelId?: string): ImageEstimate {
  // Higgsfield is the default provider: when its keys are set the estimate is its published per-image price (flat across sizes
  // and quality tiers). Otherwise the OpenAI table below applies. If a Higgsfield job falls back to OpenAI, the charge is capped
  // at this confirmed estimate (job.ts), so the user never pays more than they approved.
  const chosen = modelId ? hfModel(modelId) : null;
  const hfUsd = !modelId?.startsWith("openai/") && higgsfieldConfigured() ? listPriceUsd(withReference ? hfModel("hf/alibaba/qwen-image-3/edit")! : chosen?.kind === "image" ? chosen : defaultHfModel("image")!) : null;
  const usd = hfUsd ?? PRICE_USD[quality][size];
  return { units: toUnits(meteredUsd(usd)), usd, quality, size };
}

type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } | undefined | null;

/** Real provider cost from the API's token usage; falls back to the table price. Never more than 3x the table price. */
export function costFromUsage(usage: Usage, quality: ImageQuality, size: ImageSize): number {
  const table = PRICE_USD[quality][size];
  const out = Number(usage?.output_tokens);
  if (!Number.isFinite(out) || out <= 0) return table;
  const inTotal = Math.max(0, Number(usage?.input_tokens) || 0);
  const inImg = Math.min(inTotal, Math.max(0, Number(usage?.input_tokens_details?.image_tokens) || 0));
  const inText = Math.max(0, inTotal - inImg);
  const usd = out * TOKEN_USD.imageOut + inText * TOKEN_USD.textIn + inImg * TOKEN_USD.imageIn;
  return Math.min(Math.max(usd, 0), table * 3);
}

export const imagesKillSwitch = () => process.env.KEPLAR_IMAGES_OFF === "1";
export const openaiKey = () => process.env.OPENAI_API_KEY?.trim() ?? "";
/** Configured when Higgsfield (default) or OpenAI (fallback) has keys. */
export const imagesConfigured = () => (higgsfieldConfigured() || openaiKey() !== "") && !imagesKillSwitch();
export const imageProvider = (): "higgsfield" | "openai" | null => (higgsfieldConfigured() ? "higgsfield" : openaiKey() !== "" ? "openai" : null);
/** The base URL can only be overridden outside production (tests), so the key can never be sent to another host there. */
export const openaiBase = () => (process.env.NODE_ENV !== "production" && process.env.KEPLAR_OPENAI_BASE?.trim() ? process.env.KEPLAR_OPENAI_BASE.trim() : "https://api.openai.com/v1").replace(/\/$/, "");

/** Image models offered in the picker: Higgsfield first (default), OpenAI as the selectable fallback. */
export function imageModelChoices() {
  const hf = higgsfieldConfigured();
  const out = hfModels("image", "text-to-image").map((m) => ({
    id: m.id, label: m.label, provider: "higgsfield" as const, note: m.note, available: hf, default: hf && m.default === true,
    supports: { seed: Boolean(m.opts?.seed), negativePrompt: Boolean(m.opts?.negativePrompt), references: false },
  }));
  out.push({ id: `openai/${IMAGE_MODEL}`, label: "GPT Image (fallback)", provider: "openai" as never, note: "Used automatically if Higgsfield isn't available.", available: openaiKey() !== "", default: !hf && openaiKey() !== "", supports: { seed: false, negativePrompt: false, references: false } });
  return out;
}
