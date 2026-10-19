import { RETRY } from "./config";
import { circuitAllows, circuitFailure, circuitKey, circuitRelease, circuitSuccess } from "./circuit";

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); };
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const s = Number(h);
  if (Number.isFinite(s)) return s * 1000;
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

const retryable = (status: number) => status === 429 || status >= 500;
const backoffMs = (attempt: number, maxMs: number) => Math.min(maxMs, RETRY.baseMs * 2 ** attempt) * (0.7 + Math.random() * 0.6);

/**
 * What to do after a failed attempt (pure, unit-tested):
 * - a non-retryable status (4xx other than 429) is final;
 * - our own per-attempt timeout is final: the provider may already be generating, and billing, the first request, so sending it
 *   again could charge twice. The registry falls back to another model instead;
 * - a Retry-After longer than the backoff budget is final (fail over now rather than hammer a provider that asked us to wait);
 * - otherwise (429, 5xx, a network error before any response) wait with exponential backoff and jitter, then retry.
 */
export function retryDecision(e: unknown, attempt: number, attempts: number, maxMs: number): { retry: false } | { retry: true; waitMs: number } {
  if (attempt >= attempts - 1) return { retry: false };
  if (e instanceof HttpError) {
    if (e.status === 408 || !retryable(e.status)) return { retry: false };
    if (e.retryAfterMs !== undefined && e.retryAfterMs > maxMs) return { retry: false };
    return { retry: true, waitMs: Math.min(maxMs, e.retryAfterMs ?? backoffMs(attempt, maxMs)) };
  }
  return { retry: true, waitMs: backoffMs(attempt, maxMs) };
}

/** Failures that say something about the endpoint's health (not the caller's request). */
const countsAgainstCircuit = (e: unknown) => !(e instanceof HttpError) || e.status === 408 || retryable(e.status);

const circuitOpen = (key: string) => new HttpError(503, `Circuit open for ${key.split("|")[0]}: recent calls failed, falling back.`);

/**
 * POST JSON with exponential backoff and jitter on 429, 5xx and network errors, honouring Retry-After, behind a per-endpoint
 * circuit breaker (circuit.ts). Throws HttpError after the last attempt so the registry can fall back to the next provider.
 * A per-attempt timeout surfaces as HttpError 408 and is never retried (see retryDecision).
 */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal, opts: { attempts?: number; maxMs?: number } = {}): Promise<T> {
  const key = circuitKey(url, body);
  if (!circuitAllows(key)) throw circuitOpen(key);
  let lastErr: unknown;
  const attempts = opts.attempts ?? RETRY.attempts;
  const maxMs = opts.maxMs ?? RETRY.maxMs;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, RETRY.timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal });
      if (res.ok) {
        const out = (await res.json()) as T;
        circuitSuccess(key);
        return out;
      }
      const text = await res.text().catch(() => "");
      throw new HttpError(res.status, text.slice(0, 300) || res.statusText, retryAfter(res));
    } catch (e) {
      if (signal?.aborted) { circuitRelease(key); throw new DOMException("Aborted", "AbortError"); }
      lastErr = timedOut ? new HttpError(408, `Timed out after ${Math.round(RETRY.timeoutMs / 1000)} s.`) : e;
      const next = retryDecision(lastErr, attempt, attempts, maxMs);
      if (!next.retry) break;
      await wait(next.waitMs, signal).catch(() => { circuitRelease(key); throw new DOMException("Aborted", "AbortError"); });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  if (countsAgainstCircuit(lastErr)) circuitFailure(key);
  else circuitRelease(key);
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}

/** A streamed chat completion folded into the same shape as a non-streamed reply. */
type StreamedChat = {
  model?: string;
  provider?: string;
  choices: { message: { content: string; refusal?: string | null; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

/**
 * POST a chat completion with `stream: true` and read the server-sent events. `onToken` gets each piece of text as it arrives.
 * Retries 429/5xx with the same backoff as postJson, but only before the first byte of the stream (a half-read stream is never retried).
 * Returns the whole reply in the usual non-streamed shape, so callers use one code path afterwards.
 */
export async function postChatStream(url: string, body: Record<string, unknown>, headers: Record<string, string>, onToken: (delta: string) => void, signal?: AbortSignal, opts: { attempts?: number; maxMs?: number } = {}): Promise<StreamedChat> {
  const key = circuitKey(url, body);
  if (!circuitAllows(key)) throw circuitOpen(key);
  let lastErr: unknown;
  const attempts = opts.attempts ?? RETRY.attempts;
  const maxMs = opts.maxMs ?? RETRY.maxMs;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, RETRY.timeoutMs);
    let started = false;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers }, body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }), signal: ctl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new HttpError(res.status, text.slice(0, 300) || res.statusText, retryAfter(res));
      }
      // Some gateways ignore stream:true and answer with plain JSON: handle that too (nothing streamed, so no onToken).
      if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
        const j = (await res.json()) as { model?: string; provider?: string; choices?: { message?: { content?: string | null; refusal?: string | null; annotations?: never }; finish_reason?: string | null }[]; usage?: StreamedChat["usage"] };
        const c = j.choices?.[0];
        circuitSuccess(key);
        return { model: j.model, provider: j.provider, choices: [{ message: { content: c?.message?.content ?? "", refusal: c?.message?.refusal }, finish_reason: c?.finish_reason }], usage: j.usage };
      }
      started = true;
      const out: StreamedChat = { choices: [{ message: { content: "" }, finish_reason: null }] };
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handle = (line: string) => {
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;
        let j: { model?: string; provider?: string; choices?: { delta?: { content?: string | null; refusal?: string | null; annotations?: never }; finish_reason?: string | null }[]; usage?: StreamedChat["usage"]; error?: { message?: string } };
        try { j = JSON.parse(data); } catch { return; }
        if (j.error) throw new HttpError(502, j.error.message ?? "Stream error");
        if (j.model) out.model = j.model;
        if (j.provider) out.provider = j.provider;
        if (j.usage) out.usage = j.usage;
        const ch = j.choices?.[0];
        if (!ch) return;
        if (ch.delta?.refusal) out.choices[0].message.refusal = (out.choices[0].message.refusal ?? "") + ch.delta.refusal;
        if (ch.delta?.content) { out.choices[0].message.content += ch.delta.content; onToken(ch.delta.content); }
        if (ch.finish_reason) out.choices[0].finish_reason = ch.finish_reason;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).replace(/\r$/, "")); buf = buf.slice(nl + 1); }
      }
      if (buf.trim()) handle(buf.trim());
      circuitSuccess(key);
      return out;
    } catch (e) {
      if (signal?.aborted) { circuitRelease(key); throw new DOMException("Aborted", "AbortError"); }
      lastErr = timedOut ? new HttpError(408, `Timed out after ${Math.round(RETRY.timeoutMs / 1000)} s.`) : e;
      if (started) break; // a stream that began is never retried (the caller already showed its text)
      const next = retryDecision(lastErr, attempt, attempts, maxMs);
      if (!next.retry) break;
      await wait(next.waitMs, signal).catch(() => { circuitRelease(key); throw new DOMException("Aborted", "AbortError"); });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  if (countsAgainstCircuit(lastErr)) circuitFailure(key);
  else circuitRelease(key);
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}
