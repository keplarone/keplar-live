/**
 * Small talk: "hi", "thanks", "how are you doing", "who are you", "bye".
 *
 * These get ONE free model (OpenRouter `:free`, with fallback to other free
 * models) and nothing else: no panel, no verifier or judge, no comparison UI,
 * no Usage charge. It applies to every plan, Plus and Pro included, because
 * a greeting is not worth a paid panel.
 *
 * The classifier is deliberately conservative. Anything with a real question,
 * a request, attachments, media, or a mode switched on goes through the full
 * Keplar engine. When in doubt it says "not small talk".
 */
import { catalogById } from "./catalog";
import { freeRoster } from "./live-catalog";
import type { createRegistry } from "./providers";
import type { Classification, KeplarAnswer, KeplarEvent, KeplarRequest, ModelSpec } from "./types";
import { identityPrompt } from "@/lib/identity";
import { SMALLTALK_VOICE_FALLBACK, VOICE_PROMPT, guardVoice } from "@/lib/persona";
import { HUMAN_TONE_SHORT, polish } from "@/lib/persona-tone";

export { isSmallTalk, smallTalkKind, type SmallTalkKind } from "./smalltalk-kind";
import { smallTalkKind, type SmallTalkKind } from "./smalltalk-kind";

/* ───────────────────────────── the reply ───────────────────────────── */

export const SMALLTALK_SYSTEM_PROMPT =
  "You are Keplar, a warm, friendly assistant. Reply in one or two short sentences that sound like a person, not a generic \"I'm here and ready to help\" line, with no jokes, puns or wisecracks unless they are joking. Plain text only: no lists, headings, markdown or quotation of the user's message, and do not show your reasoning. " + VOICE_PROMPT + " " + HUMAN_TONE_SHORT;

/** Static lines used only when every free model is busy, so a greeting never shows an error. */
const FALLBACK: Record<SmallTalkKind, string> = SMALLTALK_VOICE_FALLBACK;

/**
 * Free models to try, in order. Picked for fast, clean one-line replies on
 * 2026-09-30 (live probes: 0.4-1.0 s, no reasoning leak with reasoning excluded).
 * Nemotron 3.5 Lightning is last: its answers are fine but its free host has
 * shown 40-70 s stalls. The Gemma and Qwen free hosts are often rate-limited.
 */
export function smallTalkModels(roster: readonly ModelSpec[] = freeRoster): ModelSpec[] {
  const order = ["free:nemotron-3-super", "free:dots-3-note", "free:nemotron-3-nano-omni", "free:nemotron-3.5-lightning", "free:gemma-4-26b-a4b", "free:gemma-4-31b"];
  const byId = new Map(roster.map((m) => [m.id, m]));
  return order.map((id) => byId.get(id) ?? catalogById.get(id)).filter((m): m is ModelSpec => Boolean(m?.routable));
}

const CLASSIFICATION: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 120, estimatedOutputTokens: 60, needsWeb: false, rationale: "Casual message." };

/**
 * Strip reasoning artifacts from a model reply: <think>/<thinking>/<reasoning>
 * blocks (closed, or an unclosed opener, or a stray closer), and a leading
 * "Thinking:" style preamble. Then tidy whitespace and quotes and cut a reply that
 * was truncated mid-sentence back to its last full sentence.
 */
/**
 * Quotes a model wrapped its whole reply in come off; a quote that belongs to the text stays. Stripping a leading and a trailing quote
 * separately cut the closing quote off a punchline (live, 2026-10-13: `...it said, "I'm already grounded.` with no closing quote).
 */
function unquote(t: string): string {
  const dq = (x: string) => (x.match(/["\u201c\u201d]/g) ?? []).length;
  let s = t;
  for (let i = 0; i < 3; i++) {
    const wrapped = /^["\u201c]/.test(s) && /["\u201d]$/.test(s) && dq(s.slice(1, -1)) === 0;
    const single = /^['\u2018]/.test(s) && /['\u2019]$/.test(s) && !/['\u2018\u2019]/.test(s.slice(1, -1));
    if (wrapped || single) { s = s.slice(1, -1).trim(); continue; }
    if (dq(s) % 2 === 1) {
      if (/^["\u201c]/.test(s)) { s = s.slice(1).trim(); continue; } // a stray opener with nothing to close it
      if (/["\u201d]$/.test(s) && dq(s.slice(0, -1)) === 0) { s = s.slice(0, -1).trim(); continue; } // a stray closer
    }
    break;
  }
  return s;
}

export function cleanSmallTalk(raw: string): string {
  let t = raw ?? "";
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/^[\s\S]*?<\/(think|thinking|thought|reasoning)>/i, " ");
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*$/i, " ");
  t = t.replace(/<\/?[a-z]+>/gi, " ");
  t = unquote(t.replace(/\s+/g, " ").trim());
  if (t.length > 400) t = t.slice(0, 400);
  // Truncated mid-sentence: keep up to the last sentence end when there is one.
  if (t && !/[.!?)\u{1F300}-\u{1FAFF}\u2600-\u27BF]$/u.test(t)) {
    const cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "));
    if (cut > 8) t = t.slice(0, cut + 1);
  }
  return t.trim();
}

/** True when a reply looks like leaked reasoning or garbage rather than a friendly line. */
export function looksBroken(text: string, prompt: string): boolean {
  if (!text || text.length < 2) return true;
  if (/<\/?(think|thinking|thought|reasoning)\b/i.test(text)) return true;
  if (/^(thinking|reasoning|analysis|okay, the user|ok, the user|the user|let me think|first, i|we need to|i need to)/i.test(text)) return true;
  if (/\b(the user (said|says|is|wants|asked)|user said|they said)\b/i.test(text)) return true;
  // Quotes the user's message back, or has numbered-list scaffolding ("... 2. ...").
  if (/\bsaid ["'\u201c]/i.test(text)) return true;
  if (/(^|\s)\d\.\s/.test(text)) return true;
  if (/[\r\n]\s*[-*#]/.test(text)) return true;
  const p = prompt.trim().toLowerCase();
  if (p.length > 3 && text.toLowerCase().includes(`"${p}"`)) return true;
  return false;
}

export type SmallTalkDeps = {
  /** A free-only registry (OpenRouter `:free` models, free fallbacks). Never a paid one. */
  registry: ReturnType<typeof createRegistry>;
  models?: ModelSpec[];
  /** Total time for all attempts (default 12 s). */
  timeoutMs?: number;
  /** Time one model gets before it is dropped (default 6 s). */
  perModelMs?: number;
  /** Start the next model this long after the previous one if it hasn't answered (default 2 s). */
  staggerMs?: number;
};

function answer(markdown: string): KeplarAnswer {
  return {
    id: `ans_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    smalltalk: true,
    markdown,
    consensus: { level: "single", score: null, agree: 0, disagree: 0, missing: 0, responded: 1, consulted: 1, summary: "" },
    models: [],
    sources: [],
    disagreements: [],
    verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
    reasoning: "",
    capabilities: [],
    compute: { units: 0, level: "low" },
    durationMs: 0,
  };
}

/**
 * Try models in order, each with its own short timeout. The next model starts
 * when the previous one fails OR has not answered after `staggerMs` (the first
 * clean reply wins and aborts the rest), so a slow free host costs ~2 s, not
 * its full timeout. Resolves "" when none gives a clean reply.
 */
export async function firstClean(
  models: ModelSpec[],
  outer: AbortSignal,
  perModelMs: number,
  staggerMs: number,
  call: (m: ModelSpec, sig: AbortSignal) => Promise<string>,
  prompt: string,
): Promise<string> {
  if (!models.length) return "";
  const all = new AbortController();
  const sig = AbortSignal.any([outer, all.signal]);
  return new Promise<string>((resolve) => {
    let started = 0;
    let pending = 0;
    let done = false;
    let stagger: ReturnType<typeof setTimeout> | undefined;
    const finish = (t: string) => {
      if (done) return;
      done = true;
      clearTimeout(stagger);
      all.abort();
      resolve(t);
    };
    const launch = () => {
      clearTimeout(stagger);
      if (done) return;
      if (started >= models.length) { if (!pending) finish(""); return; }
      const m = models[started++];
      pending++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), perModelMs);
      const msig = AbortSignal.any([sig, ctl.signal]);
      call(m, msig)
        .then((raw) => {
          const t = cleanSmallTalk(raw);
          if (t && !looksBroken(t, prompt)) finish(t);
        })
        .catch(() => { /* timeout, abort or provider failure: try the next model */ })
        .finally(() => {
          clearTimeout(timer);
          pending--;
          if (done) return;
          if (started < models.length) launch();
          else if (!pending) finish("");
        });
      if (started < models.length) stagger = setTimeout(launch, staggerMs);
    };
    outer.addEventListener("abort", () => finish(""), { once: true });
    launch();
  });
}

/**
 * One free model answers. Events: `smalltalk` (so the UI shows a plain reply),
 * the text, then the answer. Costs nothing: the registry refuses anything that
 * isn't a $0 `:free` model.
 */
export async function* runSmallTalk(req: KeplarRequest, deps: SmallTalkDeps, signal?: AbortSignal): AsyncGenerator<KeplarEvent> {
  const started = Date.now();
  const kind = smallTalkKind(req) ?? "greeting";
  yield { type: "smalltalk" };
  const models = (deps.models ?? smallTalkModels()).slice(0, 4);
  const prompt = req.prompt.trim().slice(0, 300);
  const perModelMs = deps.perModelMs ?? 6_000;
  const staggerMs = deps.staggerMs ?? 2_000;
  const total = new AbortController();
  const totalTimer = setTimeout(() => total.abort(), deps.timeoutMs ?? 12_000);
  const outer = signal ? AbortSignal.any([signal, total.signal]) : total.signal;
  let text = "";
  try {
    text = await firstClean(models, outer, perModelMs, staggerMs, async (m, sig) => {
      // `once`: one model, no registry fallbacks of its own (those have no short timeout).
      const r = await deps.registry.once({ model: m, prompt, classification: CLASSIFICATION, params: { maxOutputTokens: 200 }, slot: "panel", system: `${SMALLTALK_SYSTEM_PROMPT} ${identityPrompt()}`, signal: sig });
      return r.ok ? r.text : "";
    }, prompt);
  } catch (e) {
    if (signal?.aborted) throw e;
  } finally {
    clearTimeout(totalTimer);
  }
  const markdown = polish(guardVoice(text || FALLBACK[kind]));
  const words = markdown.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 6) yield { type: "delta", text: words.slice(i, i + 6).join("") };
  const a = answer(markdown);
  yield { type: "answer", answer: { ...a, durationMs: Date.now() - started } };
}
