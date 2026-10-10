/**
 * OpenAI Image API client (POST /v1/images/generations). The key is read from OPENAI_API_KEY at call time and only ever
 * sent to api.openai.com in the Authorization header. Errors are reduced to a small code: provider error bodies, the
 * prompt and the key never reach logs or the browser.
 */
import { createHash } from "node:crypto";
import { costFromUsage, IMAGE_MODEL, MAX_IMAGE_BYTES, openaiBase, openaiKey, OUTPUT_FORMAT, type ImageQuality, type ImageSize } from "./config";

export type ProviderCode = "not_configured" | "busy" | "timeout" | "policy" | "bad_output" | "too_large" | "rejected" | "server";

export class ProviderError extends Error {
  constructor(public code: ProviderCode, message: string, /** Provider cost already incurred, if any. */ public usd = 0) {
    super(message);
  }
}

export type Generated = { bytes: Buffer; contentType: "image/webp" | "image/png" | "image/jpeg"; usd: number; model: string; provider?: "higgsfield" | "openai"; /** True when Higgsfield was tried first and OpenAI answered instead. */ fallback?: boolean };

/** Recognises the image by its first bytes (never trusts a label). */
export function sniffImage(b: Buffer): Generated["contentType"] | null {
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/** Stable, non-reversible id sent as OpenAI's `user` field so the provider can tell users apart for abuse handling. */
export const safetyId = (workspaceId: string) => `kp_${createHash("sha256").update(`keplar:img:${workspaceId}`).digest("hex").slice(0, 28)}`;

type GenInput = { prompt: string; size: ImageSize; quality: ImageQuality; workspaceId: string; timeoutMs?: number; /** Public URLs of reference images (image-to-image). Only Higgsfield can use them: there is no OpenAI fallback. */ referenceUrls?: string[]; /** Keplar model id (hf/… or openai/…); default is Higgsfield when configured. */ model?: string; seed?: number; negativePrompt?: string };

/**
 * Higgsfield first (the default provider) whenever its keys are set; OpenAI is the automatic fallback when Higgsfield isn't
 * configured, the prompt is longer than its limit, or it fails. A refused prompt (policy) is never retried elsewhere.
 */
export async function generateImage(input: GenInput): Promise<Generated> {
  const hf = await import("@/lib/higgsfield/image");
  const { higgsfieldConfigured } = await import("@/lib/higgsfield/client");
  if (input.referenceUrls?.length) return hf.generateHiggsfieldImage(input);
  const wantsOpenAI = input.model?.startsWith("openai/");
  if (!wantsOpenAI && higgsfieldConfigured() && !(hf.isZImage(input.model) && input.prompt.length > hf.HF_IMAGE_PROMPT_MAX)) {
    try {
      return await hf.generateHiggsfieldImage(input);
    } catch (e) {
      if (!(e instanceof ProviderError) || e.code === "policy" || !openaiKey()) throw e;
      console.error("[images] Higgsfield failed, using the OpenAI fallback:", e.code);
      return { ...(await generateOpenAIImage(input)), fallback: true };
    }
  }
  return generateOpenAIImage(input);
}

export async function generateOpenAIImage(input: GenInput): Promise<Generated> {
  const key = openaiKey();
  if (!key) throw new ProviderError("not_configured", "Image generation isn't connected yet.");
  let res: Response;
  try {
    res = await fetch(`${openaiBase()}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: input.prompt,
        n: 1,
        size: input.size,
        quality: input.quality,
        output_format: OUTPUT_FORMAT,
        moderation: "auto",
        user: safetyId(input.workspaceId),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 140_000),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("timeout", "The image service took too long.");
    throw new ProviderError("busy", "The image service couldn't be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string } } | null;
    const code = `${body?.error?.code ?? ""} ${body?.error?.type ?? ""}`;
    if (res.status === 400 && /moderation|content_policy|safety/i.test(code)) throw new ProviderError("policy", "The image service declined this prompt.");
    if (res.status === 429 || res.status >= 500 || res.status === 408) throw new ProviderError("busy", `The image service is busy (${res.status}).`);
    // 400 (bad params), 401/403 (key or billing problem): ours to fix, not the user's. Detail stays out of the message.
    throw new ProviderError("rejected", `The image service rejected the request (${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; usage?: Parameters<typeof costFromUsage>[0] } | null;
  const usd = costFromUsage(json?.usage, input.quality, input.size);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError("bad_output", "The image service returned no image.", usd);
  let bytes = Buffer.from(b64, "base64");
  let contentType = sniffImage(bytes);
  if (!contentType) throw new ProviderError("bad_output", "The image service returned an unreadable file.", usd);
  if (bytes.length > MAX_IMAGE_BYTES && contentType === "image/png") {
    // Very detailed images can exceed what one function response can carry. Re-pack losslessly (identical pixels, smaller file): never lossy.
    try {
      const sharp = (await import("sharp")).default;
      const packed = await sharp(bytes).webp({ lossless: true, effort: 5 }).toBuffer();
      if (packed.length < bytes.length) { bytes = packed; contentType = "image/webp"; }
    } catch { /* keep the original; the size check below decides */ }
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new ProviderError("too_large", "The image came back larger than allowed.", usd);
  return { bytes, contentType, usd, model: IMAGE_MODEL, provider: "openai" };
}
