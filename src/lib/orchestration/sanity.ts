/**
 * Optional second-model sanity check for answers that only ONE model produced (KEPLAR_SINGLE_SANITY=1; off by default
 * because it adds one short $0-model call and a second or two of latency). A different free model is asked only
 * "is this a coherent, on-topic reply?" with a hard timeout. "unknown" (timeout, busy host, unclear reply) never blocks an
 * answer: the deterministic quality gate (quality-gate.ts) already ran, this is an extra net, not a new single point of failure.
 */
import { freeRoster } from "./live-catalog";
import type { createRegistry } from "./providers";
import type { Classification } from "./types";

export const SANITY_SYSTEM = "You check replies. Say exactly OK if the reply is a coherent, readable answer to the question (even if short or if it asks for missing details). Say exactly BAD if it is garbled, word salad, off-topic, or repeats nonsense. One word only.";
const CLASSIFICATION: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 600, estimatedOutputTokens: 4, needsWeb: false, rationale: "Sanity check." };
const ORDER = ["free:qwen3.8-27b", "free:nemotron-3-super", "free:dots-3-note"];

export const sanityEnabled = (env: Record<string, string | undefined> = process.env) => env.KEPLAR_SINGLE_SANITY === "1";

/** Pure: map the checker's raw reply to a verdict. Anything but a clear OK/BAD is "unknown". */
export function parseSanity(raw: string): "ok" | "bad" | "unknown" {
  const t = raw.trim().toUpperCase().replace(/[^A-Z ]/g, " ").trim().split(/\s+/)[0] ?? "";
  return t === "OK" ? "ok" : t === "BAD" ? "bad" : "unknown";
}

export async function sanityCheck(registry: ReturnType<typeof createRegistry>, o: { question: string; answer: string; answeredBy: string; signal?: AbortSignal; timeoutMs?: number }): Promise<"ok" | "bad" | "unknown"> {
  const model = ORDER.map((id) => freeRoster.find((m) => m.id === id)).find((m) => m && m.id !== o.answeredBy);
  if (!model) return "unknown";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 4_000);
  try {
    const sig = o.signal ? AbortSignal.any([o.signal, ctl.signal]) : ctl.signal;
    const r = await registry.once({ model, prompt: `Question:\n${o.question.slice(0, 600)}\n\nReply:\n${o.answer.slice(0, 1200)}`, classification: CLASSIFICATION, params: { maxOutputTokens: 6 }, slot: "verifier", system: SANITY_SYSTEM, signal: sig });
    return r.ok ? parseSanity(r.text) : "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}
