/**
 * The two ways a product gets in: a page link (fetch, extract, copy the photos to Keplar's storage) or a photo (store the
 * original, optionally read it with a vision model). Both return a *draft* the owner reviews and edits in the
 * "Imported product" card; nothing reaches a site until they build, and no image is public until then.
 */
import { createHash } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { assertCanSpend, charge, estimateUnits } from "@/lib/create/platform/compute";
import type { Workspace } from "@/lib/create/platform/workspace";
import { EntitlementError } from "@/lib/create/platform/plans";
import { findStagedBySource, readAsset, stageAsset, sweepStaged, dailyAllowance, updateAlt, type AssetRow } from "./assets";
import { imageCandidates } from "./extract";
import { fetchImageBytes, fetchProductPage, ImportError, importMessage, type RobotsCache } from "./fetch";
import { PRODUCT_LIMITS, VISION_USD_ESTIMATE } from "./limits";
import { normalizeProduct, type ProductInfo } from "./types";
import { readProductPhoto, VisionError, type VisionResult } from "./vision";

export type AssetView = { id: string; width: number; height: number; bytes: number; alt: string; original: boolean; notes: string[]; sourceUrl?: string; contentType: string };
export const assetView = (a: AssetRow): AssetView => ({ id: a.id, width: a.width, height: a.height, bytes: a.bytes, alt: a.alt, original: a.original, notes: a.notes, sourceUrl: a.sourceUrl, contentType: a.contentType });

export type LinkImport = {
  product: ProductInfo;
  assets: AssetView[];
  excerpt: string;
  /** Things the owner should know (not found: price, images skipped, page cut short…). */
  notes: string[];
  host: string;
  finalUrl: string;
  /** Photos one site can keep on this plan. */
  maxImages: number;
};

const IMAGE_PHASE_MS = 24_000;

export async function importFromLink(ws: Workspace, rawUrl: string): Promise<LinkImport> {
  await sweepStaged(ws).catch(() => 0);
  await dailyAllowance(ws, "link");
  const cache: RobotsCache = new Map();
  const page = await fetchProductPage(rawUrl, cache);
  const x = page.extracted;
  const L = PRODUCT_LIMITS[ws.plan];
  const notes: string[] = [];
  if (!x.isProduct) notes.push("This doesn't look like a single product page, so the details below may be incomplete. Check everything.");
  if (page.truncated) notes.push("The page was very long; only the first part was read.");
  if (x.noimageai) notes.push("The page asks that its images not be used by AI tools, so none were copied. You can upload your own photos.");

  const staged: AssetRow[] = [];
  const seen = new Set<string>();
  const queue = x.images.slice(0, L.imagesPerLink + 6);
  const deadline = Date.now() + IMAGE_PHASE_MS;
  let skipped = 0;
  let quotaStop: string | null = null;
  let inflight = 0;
  const worker = async () => {
    while (queue.length && staged.length + inflight < L.imagesPerLink && Date.now() < deadline && !quotaStop) {
      const cand = queue.shift()!;
      inflight++;
      try {
        const again = await findStagedBySource(ws, cand.url);
        if (again) {
          if (!staged.some((a) => a.id === again.id)) staged.push(again);
          continue;
        }
        await dailyAllowance(ws, "image");
        // Try a larger size of the same file first (shops often list a thumbnail address), then the address as listed.
        let row: AssetRow | null = null;
        for (const url of imageCandidates(cand.url)) {
          try {
            const bytes = await fetchImageBytes(url, cache);
            const hash = createHash("sha1").update(bytes).digest("hex");
            if (seen.has(hash)) { row = null; break; }
            if (staged.length >= L.imagesPerLink) break;
            row = await stageAsset(ws, { bytes, kind: "link", name: new URL(url).pathname.split("/").pop() || "product", sourceUrl: cand.url, alt: cand.alt || x.title });
            seen.add(hash);
            break;
          } catch (e) {
            if (e instanceof EntitlementError || url === cand.url) throw e;
          }
        }
        if (row) staged.push(row);
      } catch (e) {
        if (e instanceof EntitlementError) quotaStop = e.message;
        else skipped++;
      } finally {
        inflight--;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (quotaStop && !staged.length) throw new EntitlementError(quotaStop);
  if (quotaStop) notes.push(quotaStop);
  if (skipped && x.images.length) notes.push(`${skipped} image${skipped === 1 ? "" : "s"} couldn't be used (too small, blocked, or not a photo).`);
  if (!x.images.length && !x.noimageai) notes.push("No product photos were found on that page. Upload your own.");
  if (!x.price) notes.push("No price was found. Keplar never guesses a price; add one yourself if you want it shown.");

  // Order assets the way the page ordered its images (parallel fetches finish out of order).
  const order = new Map(x.images.map((i, n) => [i.url, n]));
  staged.sort((a, b) => (order.get(a.sourceUrl ?? "") ?? 99) - (order.get(b.sourceUrl ?? "") ?? 99));

  const product = normalizeProduct({
    via: "link",
    sourceUrl: page.finalUrl,
    name: x.title,
    brand: x.brand,
    description: x.description,
    features: x.features,
    price: x.price,
    currency: x.currency,
    availability: x.availability,
    variants: x.variants,
    images: staged.map((a, i) => ({ id: a.id, alt: a.alt || x.title, role: i === 0 ? "hero" : "gallery", width: a.width, height: a.height })),
    buy: "link",
    buyUrl: x.canonical && new URL(x.canonical).hostname === new URL(page.finalUrl).hostname ? x.canonical : page.finalUrl,
    rightsConfirmed: false,
    importedAt: now(),
  });
  if (!product) throw new ImportError("empty", importMessage("empty"));
  return { product, assets: staged.map(assetView), excerpt: x.text.slice(0, 1200), notes, host: page.host, finalUrl: page.finalUrl, maxImages: L.imagesPerSite };
}

/** Stores an uploaded/pasted/dropped photo (bytes untouched unless it must be fitted or carries GPS) and returns its asset. */
export async function importFromImage(ws: Workspace, bytes: Buffer, name: string): Promise<{ asset: AssetView; product: ProductInfo; maxImages: number }> {
  await sweepStaged(ws).catch(() => 0);
  await dailyAllowance(ws, "image");
  const a = await stageAsset(ws, { bytes, kind: "upload", name });
  const product = normalizeProduct({ via: "image", sourceUrl: "", name: "", description: "", images: [{ id: a.id, alt: "", role: "hero", width: a.width, height: a.height }], buy: "contact", rightsConfirmed: false, importedAt: now() });
  return { asset: assetView(a), product: product!, maxImages: PRODUCT_LIMITS[ws.plan].imagesPerSite };
}

export type Analysis = VisionResult & { credits: number };

export async function analyzeAsset(ws: Workspace, assetId: string): Promise<Analysis> {
  const img = await readAsset(ws, assetId);
  if (!img) throw new HttpError(404, "That photo wasn't found. Upload it again.", "not_found");
  await assertCanSpend(ws, ws.plan === "free" ? 0 : estimateUnits("photo.read", VISION_USD_ESTIMATE)); // cooldown, pauses, credits left
  await dailyAllowance(ws, "vision");
  try {
    const out = await readProductPhoto(ws.plan, img.bytes);
    const credits = out.usd > 0 ? await charge(ws, "photo.read", { usd: Math.max(out.usd, 0.0005), ref: `product-photo:${assetId}` }) : 0;
    if (out.result.alt) await updateAlt(ws, assetId, out.result.alt);
    return { ...out.result, credits };
  } catch (e) {
    const billed = (e as { usd?: number }).usd ?? 0;
    if (billed > 0) await charge(ws, "photo.read", { usd: billed, ref: `product-photo:${assetId}` }).catch(() => 0);
    if (e instanceof VisionError) throw new HttpError(502, e.message, "vision_failed");
    throw e;
  }
}
export { VISION_USD_ESTIMATE };
