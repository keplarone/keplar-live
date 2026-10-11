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

export type SmallTalkKind = "greeting" | "thanks" | "how-are-you" | "bye" | "identity" | "ack";

const MAX_CHARS = 60;
const MAX_WORDS = 8;
const MAX_SEGMENTS = 3;

/** Each pattern must match a whole segment (text between , . ! ? ;). Order = priority. */
const PHRASES: { kind: SmallTalkKind; rx: RegExp }[] = [
  { kind: "greeting", rx: /^(hi+|hello+|hey+|heya|hiya|yo|howdy|greetings|sup|hola|bonjour|salut|ciao|hallo|gm|good (morning|afternoon|evening)|morning|evening|hey there|hi there|hello there)( (keplar|there|everyone|friend))?$/ },
  { kind: "how-are-you", rx: /^(how are you( doing| today| doing today)?|how r u|how are you feeling|how('?s| is) it going|how('?s| is) everything|how('?s| is) your day( going)?|how you doing|how do you do|what'?s up|whats up|wassup|how have you been|hope you('?re| are) (well|good|doing well)|you good|are you ok(ay)?)( (keplar|today))?$/ },
  { kind: "thanks", rx: /^((ok(ay)? )?(thanks|thank you|thx|ty|thank u|cheers|much appreciated|appreciate it|appreciated)( (so|very))?( (a lot|so much|very much|a ton|keplar|again|for (that|the help|your help)))*|(that|this) (helps|helped|was (helpful|great|perfect))|(great|perfect|awesome|nice)[ ]?(thanks|thank you))$/ },
  { kind: "bye", rx: /^(bye+|goodbye|good bye|bye bye|see (you|ya)( (later|soon|tomorrow))?|see you around|later|cya|ttyl|talk (to you )?later|take care|have a (good|great|nice) (day|night|one|evening|weekend)|good night|night|gotta go|i('?m| am) (off|leaving|going)|that('?s| is) all|that'?s it for now)( (keplar|now|for now|everyone))?$/ },
  { kind: "identity", rx: /^(who are you|what are you|who is this|what('?s| is) your name|who (made|built|created) you|are you (a )?(bot|ai|robot|human|real|keplar)|introduce yourself|are you there|you there|can you hear me|hello\?)( (keplar|exactly))?$/ },
  { kind: "ack", rx: /^(ok(ay)?|cool|great|nice|awesome|got it|i see|alright|sounds good|lol|haha+|hehe|wow|neat|sweet|perfect|test(ing)?( test)?|ping|nm|nothing|never ?mind)( (keplar|thanks|then))?$/ },
];

/** A greeting word that may start a segment before another small-talk phrase ("hey how are you"). */
const GREETING_LEAD = /^(hi+|hello+|hey+|heya|hiya|yo|howdy|hola)( (keplar|there))? /;

/** Tidy for matching only: lowercase, curly quotes, no emoji or stray symbols, single spaces. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ")
    .replace(/[^a-z0-9'\s,.!?;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The kind of small talk this prompt is, or null for anything else (including
 * anything that might be a real question). Pure; no network.
 */
export function smallTalkKind(req: Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">): SmallTalkKind | null {
  const raw = req.prompt ?? "";
  if (raw.length > MAX_CHARS * 2) return null;
  // Attachments, media, or any mode (web, Deep Research, Create, Agent) mean the user wants real work.
  if (req.attachments?.length) return null;
  if (req.media && (req.media.images?.length || req.media.videos?.length)) return null;
  if (req.modes && Object.values(req.modes).some(Boolean)) return null;
  // Code, links, numbers-as-content, and long text are never small talk.
  if (/[`{}<>@#$%^*=+\\/|~[\]_]|https?:|www\./i.test(raw)) return null;
  const text = normalize(raw);
  if (!text || text.length > MAX_CHARS) return null;
  if (text.split(" ").length > MAX_WORDS) return null;
  // Digits mean a quantity, date or id: a real question ("hi, what is 2+2" has symbols anyway).
  if (/\d/.test(text)) return null;
  const segments = text.split(/[,.!?;]+/).map((s) => s.trim()).filter(Boolean);
  if (!segments.length || segments.length > MAX_SEGMENTS) return null;
  const kinds: SmallTalkKind[] = [];
  for (const seg of segments) {
    const hit = PHRASES.find((p) => p.rx.test(seg));
    if (hit) { kinds.push(hit.kind); continue; }
    // "hey how are you", "hi thanks", "hello who are you": a greeting word, then another small-talk phrase, with no comma between.
    const lead = GREETING_LEAD.exec(seg);
    const rest = lead ? seg.slice(lead[0].length).trim() : "";
    const tail = rest ? PHRASES.find((p) => p.rx.test(rest)) : undefined;
    if (!tail) return null;
    kinds.push("greeting", tail.kind);
  }
  // Priority for the reply tone: identity > how-are-you > thanks > bye > greeting > ack.
  const order: SmallTalkKind[] = ["identity", "how-are-you", "thanks", "bye", "greeting", "ack"];
  return order.find((k) => kinds.includes(k)) ?? kinds[0];
}

export const isSmallTalk = (req: Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">) => smallTalkKind(req) !== null;

/* ───────────────────────────── the reply ───────────────────────────── */

export const SMALLTALK_SYSTEM_PROMPT =
  "You are Keplar, a warm assistant. Reply in one or two short sentences. Plain text only: no lists, headings, markdown or quotation of the user's message, and do not show your reasoning. " + VOICE_PROMPT + " " + HUMAN_TONE_SHORT;

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
export function cleanSmallTalk(raw: string): string {
  let t = raw ?? "";
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/^[\s\S]*?<\/(think|thinking|thought|reasoning)>/i, " ");
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*$/i, " ");
  t = t.replace(/<\/?[a-z]+>/gi, " ");
  t = t.replace(/\s+/g, " ").trim().replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").trim();
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
