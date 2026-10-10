/**
 * Higgsfield as the default image provider (model `z-image/turbo`: PNG output at 1k or 2k, $0.015/image published).
 * Used by src/lib/images/provider.ts; the OpenAI pipeline stays as the automatic fallback while Higgsfield isn't configured
 * or when it fails. Same output contract as before: the bytes are stored exactly as produced (PNG), re-packed only
 * losslessly when a function response could not carry them, never lossy.
 */
import { MAX_IMAGE_BYTES, type ImageQuality, type ImageSize } from "@/lib/images/config";
import { ProviderError, sniffImage, type Generated } from "@/lib/images/provider";
import { defaultHfModel, hfModel, imageBody, listPriceUsd, type HfModel } from "./catalog";
import { backoff, hfCancel, hfDownload, hfStatus, hfSubmit, higgsfieldConfigured, HiggsfieldError, isTerminal, type HfRequest } from "./client";

export const HF_IMAGE_PROMPT_MAX = 800;
/** Z-Image Turbo is the default image model (and the only one limited to 800 characters). */
export const isZImage = (model?: string) => !model || model === "hf/z-image/turbo";
export const hfImageModel = () => defaultHfModel("image")!;
/** Published price per image, USD (flat across 1k and 2k). */
export const hfImageUsd = () => listPriceUsd(hfImageModel()) ?? 0;

const RATIO: Record<ImageSize, string> = { "1536x1024": "3:2", "1024x1024": "1:1", "1024x1536": "2:3" };
/** High asks for the 2k tier (largest PNG); Draft and Standard use 1k. Price is the same at both tiers. */
export function hfImageParams(quality: ImageQuality, size: ImageSize) {
  return { resolution: quality === "high" ? "2k" : "1k", aspect_ratio: RATIO[size] };
}

type Opts = { prompt: string; size: ImageSize; quality: ImageQuality; workspaceId: string; deadlineMs?: number; sleepMs?: (n: number) => number; pollMs?: (n: number) => number; referenceUrls?: string[]; model?: string; seed?: number; negativePrompt?: string };

export const hfEditModel = () => hfModel("hf/alibaba/qwen-image-3/edit")!;
/** Published upper bound for a reference (edit) image; the 1k/2k split is not published. */
export const hfEditUsd = () => listPriceUsd(hfEditModel()) ?? 0;

function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof HiggsfieldError) {
    if (e.code === "timeout" || e.code === "busy" || e.code === "unavailable" || e.code === "server") return new ProviderError(e.code === "timeout" ? "timeout" : "busy", "The image service is busy.");
    if (e.code === "bad_output") return new ProviderError("bad_output", "The image service returned an unusable file.");
    return new ProviderError("rejected", "The image service rejected the request."); // auth, credits, validation, not_found: ours to fix
  }
  return new ProviderError("server", "Image generation failed.");
}

async function once(o: Opts, resolution: string, model: HfModel = hfImageModel()): Promise<{ bytes: Buffer; contentType: Generated["contentType"] }> {
  const m = model;
  const params = { ...hfImageParams(o.quality, o.size), resolution };
  const body = imageBody(m, { prompt: o.prompt, aspectRatio: params.aspect_ratio, resolution, refs: o.referenceUrls?.length ? { imageUrls: o.referenceUrls, videoUrls: [] } : undefined, opts: { seed: o.seed, negativePrompt: o.negativePrompt } });
  const key = `kp-img-${o.workspaceId.slice(-8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const req = await hfSubmit(m.endpoint, body, { idempotencyKey: key, sleepMs: o.sleepMs });
  const deadline = Date.now() + (o.deadlineMs ?? 100_000);
  let cur: HfRequest = req;
  for (let i = 0; !isTerminal(cur.status); i++) {
    if (Date.now() > deadline) {
      await hfCancel(req.request_id);
      throw new ProviderError("timeout", "The image service took too long.");
    }
    await new Promise((r) => setTimeout(r, (o.pollMs ?? ((n) => Math.min(6000, 1500 + n * 500)))(i)));
    cur = await hfStatus(req.request_id, { sleepMs: o.sleepMs });
  }
  if (cur.status === "nsfw") throw new ProviderError("policy", "The image service declined this prompt.");
  if (cur.status !== "completed") throw new ProviderError("busy", "The image service didn't finish.");
  const url = cur.images?.[0]?.url;
  if (!url) throw new ProviderError("bad_output", "The image service returned no image.");
  const dl = await hfDownload(url, 40_000_000);
  let bytes = dl.bytes;
  let contentType = sniffImage(bytes);
  if (!contentType) throw new ProviderError("bad_output", "The image service returned an unreadable file.");
  if (bytes.length > MAX_IMAGE_BYTES && contentType === "image/png") {
    try {
      const sharp = (await import("sharp")).default;
      const packed = await sharp(bytes).webp({ lossless: true, effort: 5 }).toBuffer();
      if (packed.length < bytes.length) { bytes = packed; contentType = "image/webp"; }
    } catch { /* keep the original; the size check below decides */ }
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new ProviderError("too_large", "The image came back larger than allowed.");
  return { bytes, contentType };
}

export async function generateHiggsfieldImage(o: Opts): Promise<Generated> {
  if (!higgsfieldConfigured()) throw new ProviderError("not_configured", "Image generation isn't connected yet.");
  const withRef = Boolean(o.referenceUrls?.length);
  const m = withRef ? hfEditModel() : ((o.model ? hfModel(o.model) : null) ?? hfImageModel());
  if (m.kind !== "image") throw new ProviderError("rejected", "Unknown image model.");
  const first = hfImageParams(o.quality, o.size).resolution;
  try {
    let out;
    try {
      out = await once(o, withRef ? "1k" : first, m);
    } catch (e) {
      // A very detailed 2k PNG that cannot be carried: one retry at 1k (same price) before giving up on this provider.
      if (!withRef && e instanceof ProviderError && e.code === "too_large" && first === "2k") out = await once(o, "1k", m);
      else throw e;
    }
    return { bytes: out.bytes, contentType: out.contentType, usd: listPriceUsd(m) ?? 0, model: m.endpoint, provider: "higgsfield" };
  } catch (e) {
    throw toProviderError(e);
  }
}
export { backoff };
