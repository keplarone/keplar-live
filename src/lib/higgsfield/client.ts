/**
 * Higgsfield API client (server only). Verified against docs.higgsfield.ai and open.higgsfield.ai on 2026-10-03:
 *   Base URL        https://api.higgsfield.ai
 *   Auth            Authorization: Key <KEY_ID>:<KEY_SECRET>
 *   Submit          POST /<model-id>            (JSON body per model) -> { status, request_id, status_url, cancel_url }
 *   Status          GET  /requests/{request_id}/status  (queued | in_progress | completed | failed | nsfw | canceled)
 *   Cancel          POST /requests/{request_id}/cancel  (only while queued)
 *   Estimate        POST /estimate/<model-id>   -> { credits, usd }   (authoritative for the account)
 *   Upload          POST /files/generate-upload-url -> presigned PUT, then pass public_url
 *   Webhook         ?hf_webhook=<https url> on submit; no signature is documented, so Keplar never trusts a delivery:
 *                   it only uses it as a "go check now" signal and re-reads the status with its own credentials.
 *   Retries         Idempotency-Key header on submit; retry network errors and 5xx with backoff + jitter.
 * The key and secret are read from the environment at call time, only ever sent to the Higgsfield host in the
 * Authorization header, and never logged, returned or stored.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type HfErrorCode = "not_configured" | "auth" | "credits" | "not_found" | "busy" | "blocked" | "validation" | "unavailable" | "timeout" | "server" | "bad_output";

export class HiggsfieldError extends Error {
  constructor(public code: HfErrorCode, message: string, public status = 0, public retryable = false) {
    super(message);
  }
}

/** Env var names. HIGGSFIELD_API is the one set in Vercel: `KEY_ID:KEY_SECRET`, or a single token if that is how the key was issued.
 *  HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET are accepted as a fallback. */
export const HF_ENV = { combined: "HIGGSFIELD_API", key: "HIGGSFIELD_API_KEY", secret: "HIGGSFIELD_API_SECRET" } as const;

const clean = (v: string | undefined) => (v ?? "").trim();

/** The value after `Authorization: Key `. Never logged or returned; only built here, at call time. */
function credentials(): { value: string; source: "combined" | "pair"; shape: "id:secret" | "single" } | null {
  const combined = clean(process.env[HF_ENV.combined]).replace(/^key\s+/i, "");
  if (combined) return { value: combined, source: "combined", shape: combined.includes(":") ? "id:secret" : "single" };
  const k = clean(process.env[HF_ENV.key]);
  const sec = clean(process.env[HF_ENV.secret]);
  if (k && sec) return { value: `${k}:${sec}`, source: "pair", shape: "id:secret" };
  if (k && !sec && k.includes(":")) return { value: k, source: "pair", shape: "id:secret" };
  return null;
}
export const higgsfieldOff = () => process.env.KEPLAR_HIGGSFIELD_OFF === "1";
/** True only when credentials are present and the operator kill switch is off. */
export const higgsfieldConfigured = () => credentials() !== null && !higgsfieldOff();
/** What is present (names and booleans only; the values never leave this module). */
export function higgsfieldPresence() {
  const c = credentials();
  return { configured: c !== null, source: c ? (c.source === "combined" ? HF_ENV.combined : `${HF_ENV.key} + ${HF_ENV.secret}`) : null, shape: c?.shape ?? null, killSwitch: higgsfieldOff() };
}
/** Key material for signing Keplar's own tokens (webhook URL, reference tokens). */
const signingSecret = () => credentials()?.value ?? "";
export const signingSecretFor = signingSecret;

/** The base URL can only be overridden outside production (tests), so the credentials can never be sent to another host there. */
export const higgsfieldBase = () =>
  (process.env.NODE_ENV !== "production" && clean(process.env.KEPLAR_HIGGSFIELD_BASE) ? clean(process.env.KEPLAR_HIGGSFIELD_BASE) : "https://api.higgsfield.ai").replace(/\/$/, "");

const authHeader = () => `Key ${credentials()?.value ?? ""}`;

export type HfStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
export type HfRequest = { status: HfStatus; request_id: string; status_url?: string; cancel_url?: string; error?: string | null; video?: { url?: string }; images?: { url?: string }[] };

export const TERMINAL: HfStatus[] = ["completed", "failed", "nsfw", "canceled"];
export const isTerminal = (s: string) => (TERMINAL as string[]).includes(s);

export function mapHttpError(status: number, detail: unknown): HiggsfieldError {
  const d = typeof detail === "string" ? detail : "";
  if (status === 401) return new HiggsfieldError("auth", "Keplar's Higgsfield credentials were rejected.", status);
  if (status === 403) return new HiggsfieldError("credits", "The Higgsfield account is out of credits.", status);
  if (status === 404) return new HiggsfieldError("not_found", "That Higgsfield model or request isn't available for this account.", status);
  if (status === 400 && /concurrent/i.test(d)) return new HiggsfieldError("busy", "Higgsfield is at its concurrency limit right now.", status, true);
  if (status === 400 || status === 422) return new HiggsfieldError("validation", "Higgsfield rejected the request settings.", status);
  if (status === 423 || status === 503) return new HiggsfieldError("unavailable", "That Higgsfield model is temporarily unavailable.", status, true);
  if (status === 408 || status === 429 || status >= 500) return new HiggsfieldError("server", "Higgsfield had a problem.", status, true);
  return new HiggsfieldError("server", `Unexpected Higgsfield response (${status}).`, status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const backoff = (attempt: number, baseMs = 400) => Math.round(baseMs * 2 ** attempt + Math.random() * baseMs);

type CallOpts = { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; query?: Record<string, string>; timeoutMs?: number; retries?: number; sleepMs?: (n: number) => number };

/** One authenticated call with bounded retries (network errors, 5xx, 408/429). Never retries 4xx business errors. */
export async function hfCall<T>(path: string, o: CallOpts = {}): Promise<{ data: T; correlationId: string | null }> {
  if (!higgsfieldConfigured()) throw new HiggsfieldError("not_configured", "Higgsfield isn't connected yet.");
  const url = new URL(path.startsWith("http") ? path : `${higgsfieldBase()}${path}`);
  if (!url.href.startsWith(higgsfieldBase()) && process.env.NODE_ENV === "production") throw new HiggsfieldError("server", "Refusing to send credentials to another host.");
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);
  const retries = o.retries ?? 2;
  let last: HiggsfieldError = new HiggsfieldError("server", "Higgsfield could not be reached.", 0, true);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: o.method ?? "GET",
        headers: { authorization: authHeader(), accept: "application/json", ...(o.body !== undefined ? { "content-type": "application/json" } : {}), ...(o.idempotencyKey ? { "idempotency-key": o.idempotencyKey } : {}) },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
      });
      const correlationId = res.headers.get("x-correlation-id");
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
      if (res.ok) return { data: (json ?? {}) as T, correlationId };
      const detail = (json as { detail?: unknown } | null)?.detail;
      last = mapHttpError(res.status, detail);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      last = new HiggsfieldError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "server", name === "TimeoutError" || name === "AbortError" ? "Higgsfield took too long to answer." : "Higgsfield could not be reached.", 0, true);
    }
    if (!last.retryable || attempt === retries) break;
    await sleep((o.sleepMs ?? backoff)(attempt));
  }
  throw last;
}

export async function hfSubmit(modelPath: string, body: Record<string, unknown>, opts: { idempotencyKey: string; webhookUrl?: string; sleepMs?: (n: number) => number }): Promise<HfRequest> {
  const { data } = await hfCall<HfRequest>(`/${modelPath}`, { method: "POST", body, idempotencyKey: opts.idempotencyKey, query: opts.webhookUrl ? { hf_webhook: opts.webhookUrl } : undefined, sleepMs: opts.sleepMs });
  if (!data.request_id) throw new HiggsfieldError("server", "Higgsfield did not return a request id.");
  return data;
}

export async function hfStatus(requestId: string, opts: { sleepMs?: (n: number) => number } = {}): Promise<HfRequest> {
  if (!/^[0-9a-f-]{8,64}$/i.test(requestId)) throw new HiggsfieldError("not_found", "Unknown request id.");
  const { data } = await hfCall<HfRequest>(`/requests/${requestId}/status`, { sleepMs: opts.sleepMs, retries: 3 });
  return data;
}

export async function hfCancel(requestId: string): Promise<boolean> {
  try {
    await hfCall(`/requests/${requestId}/cancel`, { method: "POST", retries: 0 });
    return true;
  } catch {
    return false;
  }
}

/** The account's own price for exactly these parameters. { credits, usd } come back as strings. */
export async function hfEstimate(modelPath: string, body: Record<string, unknown>): Promise<{ usd: number; credits: number } | null> {
  try {
    const { data } = await hfCall<{ usd?: string | number; credits?: string | number }>(`/estimate/${modelPath}`, { method: "POST", body, retries: 1, timeoutMs: 10_000 });
    const usd = Number(data.usd);
    return Number.isFinite(usd) && usd >= 0 ? { usd, credits: Number(data.credits) } : null;
  } catch {
    return null;
  }
}

/** Costless credential check: a well-formed unknown request id answers 404 when the credentials are valid and 401 when not. */
export async function hfCheckConnection(): Promise<{ ok: boolean; state: "valid" | "rejected" | "unreachable" | "not_configured" }> {
  if (!higgsfieldConfigured()) return { ok: false, state: "not_configured" };
  try {
    await hfCall("/requests/00000000-0000-4000-8000-000000000000/status", { retries: 0, timeoutMs: 8_000 });
    return { ok: true, state: "valid" };
  } catch (e) {
    if (e instanceof HiggsfieldError) {
      if (e.code === "not_found") return { ok: true, state: "valid" };
      if (e.code === "auth") return { ok: false, state: "rejected" };
    }
    return { ok: false, state: "unreachable" };
  }
}

export type Presigned = { uploadUrl: string; publicUrl: string; headers: Record<string, string> };

/** Asks Higgsfield for a one-hour presigned upload URL (Keplar's credentials are used here, never sent to the storage host). */
export async function hfPresign(contentType: string): Promise<Presigned> {
  const { data } = await hfCall<{ upload_url?: string; public_url?: string; upload_headers?: Record<string, string> }>("/files/generate-upload-url", { method: "POST", body: { content_type: contentType }, retries: 1 });
  if (!data.upload_url || !data.public_url) throw new HiggsfieldError("server", "Higgsfield did not return an upload URL.");
  const up = new URL(data.upload_url);
  const pub = new URL(data.public_url);
  if ((up.protocol !== "https:" || pub.protocol !== "https:") && process.env.NODE_ENV === "production") throw new HiggsfieldError("server", "Unsafe upload URL.");
  return { uploadUrl: data.upload_url, publicUrl: data.public_url, headers: data.upload_headers ?? { "Content-Type": contentType } };
}

/** Server-side upload of small files (under the 4.5 MB request cap); larger files go browser -> storage with the presigned URL. */
export async function hfUploadBytes(bytes: Buffer, contentType: string): Promise<string> {
  const p = await hfPresign(contentType);
  const res = await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) throw new HiggsfieldError("server", "Uploading the reference failed.", res?.status ?? 0, true);
  return p.publicUrl;
}

/** Downloads a finished output (outputs are kept at least 7 days). Bounded in size and time. */
export async function hfDownload(url: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) throw new HiggsfieldError("bad_output", "Unsafe output URL.");
  let res: Response;
  try {
    res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(60_000) }); // no credentials are sent to the CDN
  } catch {
    throw new HiggsfieldError("server", "Downloading the result failed.", 0, true);
  }
  if (!res.ok) throw new HiggsfieldError("server", `Downloading the result failed (${res.status}).`, res.status, res.status >= 500);
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) throw new HiggsfieldError("bad_output", "The result is larger than allowed.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) throw new HiggsfieldError("bad_output", "The result is empty or larger than allowed.");
  return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

/** Webhook token: HMAC of the job coordinates keyed with the API secret. Not a secret itself, only proves the URL was minted by Keplar. */
export function webhookToken(workspaceId: string, jobId: string): string {
  return createHmac("sha256", `keplar-hf-webhook:${signingSecret()}`).update(`${workspaceId}\n${jobId}`).digest("hex").slice(0, 40);
}
export function webhookTokenValid(workspaceId: string, jobId: string, token: string): boolean {
  if (!signingSecret() || !/^[a-f0-9]{40}$/.test(token)) return false;
  const a = Buffer.from(webhookToken(workspaceId, jobId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Public HTTPS URL Higgsfield can call; null when Keplar has no public https origin (then polling alone is used). */
export function webhookUrl(workspaceId: string, jobId: string): string | null {
  const origin = clean(process.env.KEPLAR_PUBLIC_URL) || clean(process.env.BETTER_AUTH_URL);
  if (!origin.startsWith("https://")) return null;
  const u = new URL("/api/webhooks/higgsfield", origin);
  u.searchParams.set("w", workspaceId);
  u.searchParams.set("j", jobId);
  u.searchParams.set("t", webhookToken(workspaceId, jobId));
  return u.toString();
}
