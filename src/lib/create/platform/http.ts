import { keepAlive } from "./after";
import { EntitlementError } from "./plans";
import { RateLimitError } from "./ratelimit";
import { CooldownError } from "./cooldown";
import { logEvent } from "@/lib/ops/log";
import { recordError, routeFromStack } from "@/lib/ops/errors";

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export function errorResponse(err: unknown) {
  if (err instanceof CooldownError) return json({ error: err.message, code: "cooldown", until: err.info.until, startedAt: err.info.startedAt, strikes: err.info.strikes }, { status: 429, headers: { "retry-after": String(Math.ceil(err.info.remainingMs / 1000)) } });
  if (err instanceof EntitlementError) return json({ error: err.message, code: "entitlement", upgradeTo: err.upgradeTo }, { status: 402 });
  if (err instanceof RateLimitError) return json({ error: err.message, code: "rate_limited" }, { status: 429 });
  if (err instanceof HttpError) return json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status });
  logEvent("error", "unhandled_route_error", { name: err instanceof Error ? err.name : "unknown" });
  keepAlive(recordError({ source: "server", name: err instanceof Error ? err.name : "unknown", message: err instanceof Error ? err.message : String(err), route: err instanceof Error ? routeFromStack(err.stack) : undefined }), "error record");
  return json({ error: "Something went wrong.", code: "internal" }, { status: 500 });
}

/**
 * The text a client may see for an error caught mid-stream: our own user-facing errors keep their message; anything else
 * (a provider's or database's error text, which can carry hosts, ids or upstream wording) becomes `fallback` and is recorded.
 */
export function publicErrorText(err: unknown, fallback: string): string {
  if (err instanceof HttpError || err instanceof EntitlementError || err instanceof RateLimitError || err instanceof CooldownError) return err.message;
  logEvent("error", "stream_error", { name: err instanceof Error ? err.name : "unknown" });
  void recordError({ source: "server", name: err instanceof Error ? err.name : "unknown", message: err instanceof Error ? err.message : String(err), route: err instanceof Error ? routeFromStack(err.stack) : undefined });
  return fallback;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "bad_request", public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** JSON bodies read through body(): above Vercel's own 4.5 MB request limit, so only a self-hosted or local server ever reaches it. */
export const MAX_JSON_BODY_BYTES = 5_000_000;

export async function body<T>(req: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<T> {
  const text = await readText(req, maxBytes);
  if (text === null) throw new HttpError(413, "That request is too large.", "too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

/**
 * The request body, read as a stream and abandoned as soon as it passes `maxBytes` (null then). A declared Content-Length
 * over the cap is refused before reading; a body sent without one (chunked) is still stopped at the cap, never buffered whole.
 */
export async function readBytes(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = req.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) return null;
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** A form body (urlencoded or multipart) read through readBytes: null when over the cap or not a form. */
export async function readFormData(req: Request, maxBytes: number): Promise<FormData | null> {
  const bytes = await readBytes(req, maxBytes);
  if (bytes === null) return null;
  try {
    return await new Response(bytes, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return null;
  }
}

/** readBytes as UTF-8 text (null when over the cap). */
export async function readText(req: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBytes(req, maxBytes);
  return bytes === null ? null : Buffer.from(bytes).toString("utf8");
}
