/**
 * Product import limits by plan. Importing costs Keplar almost nothing (a page fetch, a few image downloads, storage), so
 * the guardrails are about abuse and storage, plus the model cost of the optional "read this photo" step, which is
 * metered like any other model call (free models on Free, a cheap vision model on paid plans).
 */
import type { PlanId } from "@/lib/create/platform/plans";

export type ProductLimits = {
  /** Product-page imports per rolling 24 h. */
  linkPerDay: number;
  /** Photos analysed by a vision model per rolling 24 h. */
  visionPerDay: number;
  /** Images kept on one site. */
  imagesPerSite: number;
  /** Images pulled from one product page. */
  imagesPerLink: number;
  /** Uploads + link images per rolling 24 h. */
  imagesPerDay: number;
  /** Images and bytes the account keeps in product storage (attached to sites or waiting to be). */
  storedImages: number;
  storedBytes: number;
};

export const PRODUCT_LIMITS: Record<PlanId, ProductLimits> = {
  free: { linkPerDay: 5, visionPerDay: 5, imagesPerSite: 3, imagesPerLink: 4, imagesPerDay: 12, storedImages: 8, storedBytes: 24_000_000 },
  lite: { linkPerDay: 15, visionPerDay: 15, imagesPerSite: 6, imagesPerLink: 6, imagesPerDay: 30, storedImages: 30, storedBytes: 90_000_000 },
  plus: { linkPerDay: 40, visionPerDay: 40, imagesPerSite: 10, imagesPerLink: 8, imagesPerDay: 80, storedImages: 80, storedBytes: 250_000_000 },
  pro: { linkPerDay: 100, visionPerDay: 100, imagesPerSite: 16, imagesPerLink: 10, imagesPerDay: 200, storedImages: 200, storedBytes: 600_000_000 },
  business: { linkPerDay: 200, visionPerDay: 200, imagesPerSite: 24, imagesPerLink: 10, imagesPerDay: 400, storedImages: 400, storedBytes: 1_200_000_000 },
};

/** One stored image never exceeds this (below Vercel's 4.5 MB response limit, same as generated images). */
export const MAX_ASSET_BYTES = 4_300_000;
/** Longest edge kept; bigger images are scaled down (never up). */
export const MAX_ASSET_EDGE = 4096;
/** A page larger than this is read only up to this point. */
export const MAX_PAGE_BYTES = 1_800_000;
export const PAGE_TIMEOUT_MS = 12_000;
export const IMAGE_TIMEOUT_MS = 12_000;
/** Source image download cap (before it is checked and, if needed, fitted). */
export const MAX_SOURCE_IMAGE_BYTES = 14_000_000;
/** Unattached images are deleted after this long. */
export const STAGED_TTL_MS = 24 * 3600_000;

/** Rough model cost of reading one photo: ~1.6k image tokens in + ~350 out on Gemini 3.8 Flash ≈ $0.0025. Free plan uses $0 models. */
export const VISION_USD_ESTIMATE = 0.003;
