/**
 * One OpenRouter chat call with a model fallback chain, real cost from `usage.cost` (priced from tokens when missing), an
 * overall deadline and an idle timeout for streams. Every Keplar Apps model call goes through here so metering is uniform.
 */
import { OPENROUTER_BASE, providerRouting } from "@/lib/site-builder/generate";
import { priceOf, type AppModel } from "./models";

export class LlmError extends Error {
  constructor(message: string, public code = "model_failed", public usd = 0) {
    super(message);
  }
}

export type Msg = { role: "system" | "user" | "assistant"; content: string | unknown[] };
export type LlmResult = { text: string; usd: number; model: AppModel; inTok: number; outTok: number };

const approxTok = (s: string) => Math.ceil(s.length / 3.5);
const tokOfChars = (n: number) => Math.ceil(n / 3.5);
const msgChars = (m: Msg[]) => m.reduce((a, x) => a + (typeof x.content === "string" ? x.content.length : 4000), 0);

export const CREDITS_MSG = "OpenRouter is out of credits. Add credits at openrouter.ai, then try again.";

/** True when OpenRouter (or the upstream) refused because the account has no credits / payment required. */
export function isCreditsFailure(status: number, body: string): boolean {
  if (status === 402) return true;
  return /\b(402|payment required|insufficient[_ ]?(credits|funds|balance)|out of credits|add credits|billing|credit limit)\b/i.test(body);
}

/**
 * Calls the first model that answers. `onDelta` streams text when given. `accept` can reject an answer (e.g. JSON that does not
 * parse) so the next model is tried; the rejected call is still counted in `usd`.
 */
export async function llm(
  chain: AppModel[],
  messages: Msg[],
  opts: { maxTokens: number; temperature?: number; deadline: number; onDelta?: (d: string, total: number) => void; accept?: (text: string) => boolean; json?: boolean; reasoning?: "none" | "low" | "medium"; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<LlmResult> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new LlmError("The app builder isn't connected to its models yet.", "not_configured");
  const f = opts.fetchImpl ?? fetch;
  let spent = 0;
  let last = "The models are busy right now. Try again in a minute.";
  let sawCredits = false;
  for (const model of chain) {
    const left = opts.deadline - Date.now();
    if (left < 8_000) break;
    // Cap a single non-streaming call so a silent hang cannot burn the whole request budget alone.
    const callMs = Math.min(left, opts.onDelta ? left : model.free ? 90_000 : 75_000);
    const ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), callMs);
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let text = "";
    try {
      const stream = Boolean(opts.onDelta);
      const res = await f(`${OPENROUTER_BASE()}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "http-referer": "https://keplar.one", "x-title": "Keplar" },
        body: JSON.stringify({
          model: model.id,
          stream,
          temperature: opts.temperature ?? 0.5,
          max_tokens: Math.min(opts.maxTokens, model.maxOut),
          messages,
          usage: { include: true },
          ...(opts.json && !model.free ? { response_format: { type: "json_object" } } : {}),
          provider: providerRouting(model.free),
          reasoning: { effort: model.free ? "low" : opts.reasoning ?? "low", exclude: true },
        }),
        signal: ctl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
        console.warn(`[app-builder] ${model.id} -> ${res.status} ${detail}`);
        if (isCreditsFailure(res.status, detail)) {
          sawCredits = true;
          last = CREDITS_MSG;
          // Paid model out of credits: try a free fallback if the chain has one. Free model 402 is terminal.
          if (model.free) throw new LlmError(CREDITS_MSG, "credits", spent);
          continue;
        }
        last = res.status === 429 ? "The models are busy right now. Try again in a minute." : `The model was unavailable (${res.status}).`;
        continue;
      }
      let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;
      if (stream && res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const idle = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new LlmError("The model stopped responding.", "idle")), model.free ? 75_000 : 60_000); });
          const next = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
          if (next.done) break;
          buf += dec.decode(next.value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; usage?: typeof usage; error?: { message?: string; code?: number | string } };
              if (j.error) {
                const em = j.error.message?.slice(0, 200) || "The model returned an error.";
                if (isCreditsFailure(Number(j.error.code) || 0, em)) throw new LlmError(CREDITS_MSG, "credits", spent);
                throw new LlmError(em.slice(0, 160), "upstream");
              }
              const d = j.choices?.[0]?.delta?.content;
              if (d) {
                text += d;
                opts.onDelta!(d, text.length);
              }
              if (j.usage) usage = j.usage;
            } catch (e) {
              if (e instanceof LlmError) throw e;
            }
          }
        }
      } else {
        // Non-streaming: race the body read against the same abort so a silent hang cannot stick the plan stage forever.
        const raw = await res.text();
        let j: { choices?: { message?: { content?: string } }[]; usage?: typeof usage; error?: { message?: string; code?: number | string } };
        try {
          j = JSON.parse(raw) as typeof j;
        } catch {
          last = "The model returned an unreadable answer.";
          continue;
        }
        if (j.error) {
          const em = j.error.message?.slice(0, 200) || "The model returned an error.";
          if (isCreditsFailure(Number(j.error.code) || 0, em)) {
            sawCredits = true;
            if (model.free) throw new LlmError(CREDITS_MSG, "credits", spent);
            last = CREDITS_MSG;
            continue;
          }
          throw new LlmError(em.slice(0, 160), "upstream");
        }
        text = j.choices?.[0]?.message?.content ?? "";
        usage = j.usage;
      }
      const inTok = usage?.prompt_tokens ?? tokOfChars(msgChars(messages));
      const outTok = usage?.completion_tokens ?? approxTok(text);
      const usd = model.free ? 0 : typeof usage?.cost === "number" && usage.cost >= 0 ? usage.cost : priceOf(model, inTok, outTok);
      spent += usd;
      if (!text.trim() || (opts.accept && !opts.accept(text))) {
        last = "The model's answer could not be used.";
        continue;
      }
      return { text, usd: spent, model, inTok, outTok };
    } catch (e) {
      if (e instanceof LlmError && e.code === "credits") throw e;
      if (opts.signal?.aborted) throw new LlmError("Canceled.", "cancelled", spent);
      if (!model.free && text.length) spent += priceOf(model, tokOfChars(msgChars(messages)), approxTok(text));
      last = e instanceof LlmError ? e.message : ctl.signal.aborted ? "The model took too long." : "The model couldn't be reached.";
    } finally {
      clearTimeout(kill);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new LlmError(sawCredits ? CREDITS_MSG : last, sawCredits ? "credits" : "model_failed", spent);
}

/** First JSON object in a model answer (tolerates fences and prose around it). */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}
