import { RETRY } from "./config";

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

/**
 * POST JSON with exponential backoff and jitter on 429 and 5xx, honouring
 * Retry-After. Throws HttpError after the last attempt so the registry can
 * fall back to the next provider.
 */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal, opts: { attempts?: number; maxMs?: number } = {}): Promise<T> {
  let lastErr: unknown;
  const attempts = opts.attempts ?? RETRY.attempts;
  const maxMs = opts.maxMs ?? RETRY.maxMs;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctl.abort(), RETRY.timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => "");
      const err = new HttpError(res.status, text.slice(0, 300) || res.statusText, retryAfter(res));
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
      if (attempt === attempts - 1) break; // no wait after the last attempt
      const backoff = Math.min(maxMs, RETRY.baseMs * 2 ** attempt) * (0.7 + Math.random() * 0.6);
      await wait(Math.min(maxMs, err.retryAfterMs ?? backoff), signal);
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
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
  let lastErr: unknown;
  const attempts = opts.attempts ?? RETRY.attempts;
  const maxMs = opts.maxMs ?? RETRY.maxMs;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctl.abort(), RETRY.timeoutMs);
    let started = false;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers }, body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }), signal: ctl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpError(res.status, text.slice(0, 300) || res.statusText, retryAfter(res));
        if (res.status !== 429 && res.status < 500) throw err;
        lastErr = err;
        if (attempt === attempts - 1) break;
        const backoff = Math.min(maxMs, RETRY.baseMs * 2 ** attempt) * (0.7 + Math.random() * 0.6);
        await wait(Math.min(maxMs, err.retryAfterMs ?? backoff), signal);
        continue;
      }
      // Some gateways ignore stream:true and answer with plain JSON: handle that too (nothing streamed, so no onToken).
      if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
        const j = (await res.json()) as { model?: string; provider?: string; choices?: { message?: { content?: string | null; refusal?: string | null; annotations?: never }; finish_reason?: string | null }[]; usage?: StreamedChat["usage"] };
        const c = j.choices?.[0];
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
      return out;
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
      if (started) break; // a stream that began is never retried (the caller already showed its text)
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}
