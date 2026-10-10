/**
 * Supportive replies: stress, sadness, excitement, frustration (and distress) from the person's own words.
 *
 * These used to take the one-model path and came back thin. They now get a fuller, warmer reply from two models plus a short synthesis:
 *   1. Two free models (different families) write a draft each, in parallel. A third stands in if one is slow or fails.
 *   2. Once two good drafts are in (or one is in and the other is late), one writer merges the best of both into a single reply
 *      that keeps the warmth, the specifics and the practical next step. If the writer fails, the better draft is used (never an error).
 *   3. polish() and guardVoice() run on the way out (no boilerplate, never a claim to be human or conscious).
 * No claims are extracted and no reviewer runs: this is a person, not a fact to verify, so there is no consensus card, and it costs nothing
 * (free models only, the same registry as small talk). A concrete task with some feeling around it ("ugh, my build keeps failing, here is
 * the log") is NOT routed here; it goes through the full engine, which carries the same tone guidance.
 */
import { HeuristicClassifier } from "./classifier";
import { smallTalkModels } from "./smalltalk";
import type { createRegistry } from "./providers";
import type { Classification, KeplarAnswer, KeplarEvent, KeplarRequest, ModelSpec } from "./types";
import { identityPrompt } from "@/lib/identity";
import { VOICE_PROMPT_SHORT, guardVoice } from "@/lib/persona";
import { HUMAN_TONE_PROMPT, moodNote, polish, type Mood } from "@/lib/persona-tone";

export const SUPPORT_MOODS: ReadonlySet<Mood> = new Set<Mood>(["stressed", "sad", "excited", "frustrated", "crisis"]);

const TASK_ASK = /(?:^|[.!?;:,\n]\s*)(?:(?:what|who|when|where|which)(?:'s|\s+(?:is|are|was|were|does|did|do|has|have))\b(?!\s+(?:wrong with me|happening to me))|how (?:many|much|long|far|tall|old)\b|define\b|explain\b|write\b|draft\b|translate\b|calculate\b|compute\b|convert\b|summari[sz]e\b|debug\b|fix\b|build\b|create\b|make me\b|can you (?:write|draft|explain|translate|calculate|fix|build|make|summari[sz]e)\b)/i;

/** Does this message get the supportive path? A feeling in the person's words, and no concrete task (code, strategy, finance, research, files, modes). */
export function isSupportRequest(req: KeplarRequest): boolean {
  const mood = req.understanding?.mood as Mood | undefined;
  if (!mood || !SUPPORT_MOODS.has(mood)) return false;
  if (req.attachments?.length || (req.media && (req.media.images?.length || req.media.videos?.length))) return false;
  if (req.modes && Object.values(req.modes).some(Boolean)) return false;
  if (req.prompt.length > 1500 || /```/.test(req.prompt)) return false;
  // A concrete ask in the message ("I'm so stressed. What is the capital of Australia?", "...can you draft an email") is a task: the full engine answers it.
  if (TASK_ASK.test(req.prompt)) return false;
  const c = new HeuristicClassifier().classify(req);
  // A question to answer (factual, writing, code, strategy, ...) keeps the full engine, which carries the same tone guidance.
  return c.kind === "general" && !c.errorProne;
}

const SHAPE: Record<Exclude<Mood, "neutral">, string> = {
  stressed: "Shape: one steadying sentence that names what they are carrying, then the one or two most useful things to do next (concrete and small, in order, in plain sentences or at most three short bullets), then one line that leaves the door open. 70 to 130 words.",
  sad: "Shape: be with them first. Two or three gentle sentences that reflect what they said in their own words and say you are sorry or glad they told you. No fixing, no list, no silver lining. If it fits, one soft question or an offer to just talk. 50 to 110 words.",
  excited: "Shape: celebrate with them in your first line, in your own words, then show real interest (ask one specific question about it) and, if it fits, one useful next step or a small thing to enjoy. 40 to 100 words.",
  frustrated: "Shape: one short, genuine acknowledgement (no groveling), then the most likely way forward in two or three concrete steps, and one specific question about what they have already tried or what they see. 70 to 130 words.",
  crisis: "Shape: calm, caring and direct. Take it seriously, tell them you are glad they said it, and gently encourage them to contact someone they trust or a crisis line or emergency number right now (in the US, call or text 988; elsewhere, their local emergency number), and invite them to keep talking with you. No tips list, no diagnosis. 60 to 110 words.",
};

const SUPPORT_SYSTEM = (mood: Mood) =>
  `You are Keplar, replying to someone who has just told you how they feel or what they are going through. ${HUMAN_TONE_PROMPT} ${VOICE_PROMPT_SHORT} ` +
  `Write the reply itself, in the first person, directly to them. Warm, specific to what they actually said (use their own details), and practical where it helps. Plain text; no headings, no "As an AI", no quoting their message back, never show your reasoning. ` +
  `${mood === "neutral" ? "" : SHAPE[mood]} Invent nothing about them beyond what they said or what the saved notes say.`;

export const WRITER_SYSTEM = (mood: Mood) =>
  `You are Keplar's final writer. You get what the person said and two draft replies (A and B) written independently. Write ONE final reply that keeps the best of both: the warmest and most specific lines, the clearest practical step, no repetition, no contradictions. ` +
  `Do not mention the drafts. Write it directly to the person, in the first person, as Keplar. ${HUMAN_TONE_PROMPT} ` +
  `${mood === "neutral" ? "" : SHAPE[mood]} Plain text, no headings, no preamble. Never claim to be human.`;

/** A kind, honest reply used only when every free model is busy, so an upset person never meets an error. */
export const SUPPORT_FALLBACK: Record<Exclude<Mood, "neutral">, string> = {
  stressed: "That sounds like a lot to carry right now, and I'm sorry it's piling up. Let's make it smaller: tell me the one thing that's due first and what you've already done on it, and I'll help you plan the next hour so you're not facing everything at once.",
  sad: "I'm so sorry. That sounds really heavy, and I'm glad you told me. There's no rush and nothing you need to fix right now. If you'd like to talk about it, I'm here and I'm listening.",
  excited: "That's wonderful news, and I'm really glad you shared it! Tell me more: how are you feeling about it, and what's the first thing you want to do next?",
  frustrated: "That sounds really frustrating, and I'm sorry you're stuck. Tell me exactly what you're seeing and what you've already tried, and let's go through it one step at a time until it works.",
  crisis: "I'm really glad you told me, and I'm taking it seriously. You don't have to hold this alone: please reach out right now to someone you trust, or to a crisis line. In the US you can call or text 988; elsewhere, your local emergency number can help. I'm here and I'll keep talking with you.",
};

const CLASSIFICATION: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 500, estimatedOutputTokens: 260, needsWeb: false, rationale: "A supportive reply." };

export type SupportDeps = {
  /** A free-only registry (the one small talk uses). Never a paid one. */
  registry: ReturnType<typeof createRegistry>;
  models?: ModelSpec[];
  /** Total time for the whole reply (default 24 s). */
  timeoutMs?: number;
  /** Time one draft model gets (default 10 s). */
  draftMs?: number;
  /** When one good draft is in, how long to wait for the second before writing (default 2.5 s). */
  graceMs?: number;
  /** Start a stand-in model this long after the drafts began if fewer than two have answered (default 3 s). */
  standInMs?: number;
};

/** Leaked reasoning or junk: not a reply. (Numbered or bulleted steps are fine here.) */
export function looksLeaky(t: string, prompt: string): boolean {
  if (!t || t.length < 30) return true;
  if (/<\/?(think|thinking|thought|reasoning)\b/i.test(t)) return true;
  if (/^(thinking|reasoning|analysis|okay, the user|ok, the user|the user|let me think|we need to|i need to|first, i)/i.test(t)) return true;
  if (/\b(the user (said|says|is|wants|asked)|user said)\b/i.test(t)) return true;
  const p = prompt.trim().toLowerCase();
  if (p.length > 12 && t.toLowerCase().includes(`"${p}"`)) return true;
  return false;
}

/** Keeps line breaks and lists (unlike smalltalk's one-line cleaner): strips reasoning blocks, quotes and fences. */
function cleanDraft(raw: string): string {
  let t = raw ?? "";
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/^[\s\S]*?<\/(think|thinking|thought|reasoning)>/i, " ");
  t = t.replace(/<(think|thinking|thought|reasoning)>[\s\S]*$/i, " ");
  t = t.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  t = t.replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*\n]+)\*\*/g, "$1");
  if (t.length > 1400) t = t.slice(0, 1400);
  // Cut a reply that was truncated mid-sentence back to its last full sentence.
  if (t && !/[.!?)\u{1F300}-\u{1FAFF}\u2600-\u27BF"”’]$/u.test(t)) {
    const cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "), t.lastIndexOf(".\n"), t.lastIndexOf("!\n"), t.lastIndexOf("?\n"));
    if (cut > 40) t = t.slice(0, cut + 1);
  }
  return t.trim();
}

function answer(markdown: string, models: { name: string; id: string; provider: string }[]): KeplarAnswer {
  return {
    id: `ans_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    smalltalk: true,
    markdown,
    consensus: { level: "single", score: null, agree: 0, disagree: 0, missing: 0, responded: Math.max(1, models.length), consulted: Math.max(1, models.length), summary: "" },
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

export async function* runSupport(req: KeplarRequest, deps: SupportDeps, signal?: AbortSignal): AsyncGenerator<KeplarEvent> {
  const started = Date.now();
  const mood = (req.understanding?.mood as Mood | undefined) ?? "neutral";
  yield { type: "smalltalk" };
  const roster = (deps.models ?? smallTalkModels()).slice(0, 4);
  const total = new AbortController();
  const totalTimer = setTimeout(() => total.abort(), deps.timeoutMs ?? 24_000);
  const outer = signal ? AbortSignal.any([signal, total.signal]) : total.signal;
  const question = req.prompt.trim().slice(0, 1500);
  // The guidance block the route prepends (reading + mood) is for the engine; here the mood shape is in the system prompt, and the saved notes and recent turns still help.
  const context = (req.memory ?? "").slice(0, 3500);
  const draftPrompt = `${context}${question}`;
  const system = `${SUPPORT_SYSTEM(mood)} ${identityPrompt()}\n${moodNote(mood)}`;

  type Draft = { text: string; model: ModelSpec };
  const drafts: Draft[] = [];
  let text = "";
  try {
    // 1 · drafts, in parallel: the first two good ones win; a stand-in starts if they are slow or fail.
    await new Promise<void>((resolve) => {
      const stop = new AbortController();
      const sig = AbortSignal.any([outer, stop.signal]);
      let next = 0, pending = 0, finished = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      // eslint-disable-next-line prefer-const -- assigned after the closures that read it are defined
      let standTimer: ReturnType<typeof setTimeout> | undefined;
      const done = () => { if (finished) return; finished = true; clearTimeout(graceTimer); clearTimeout(standTimer); stop.abort(); resolve(); };
      const launch = () => {
        if (finished || next >= roster.length) { if (!pending && !finished && next >= roster.length) done(); return; }
        const m = roster[next++];
        pending++;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), deps.draftMs ?? 10_000);
        deps.registry
          .once({ model: m, prompt: draftPrompt, classification: CLASSIFICATION, params: { maxOutputTokens: 600 }, slot: "panel", system, signal: AbortSignal.any([sig, ctl.signal]) })
          .then((r) => {
            const t = r.ok ? cleanDraft(r.text) : "";
            if (t && !looksLeaky(t, question)) {
              drafts.push({ text: t, model: m });
              if (drafts.length >= 2) done();
              else if (drafts.length === 1) graceTimer = setTimeout(done, deps.graceMs ?? 2500);
            }
          })
          .catch(() => { /* slow, aborted or failed: a stand-in takes the seat */ })
          .finally(() => {
            clearTimeout(timer);
            pending--;
            if (finished) return;
            if (drafts.length + pending < 2 && next < roster.length) launch();
            else if (!pending && next >= roster.length) done();
          });
      };
      outer.addEventListener("abort", done, { once: true });
      launch();
      launch();
      standTimer = setTimeout(() => { if (drafts.length < 2) launch(); }, deps.standInMs ?? 3000);
    });
    // 2 · one writer merges two drafts; with one draft, that draft is the reply.
    if (drafts.length >= 2) {
      const [a, b] = drafts;
      const writers = [a.model, b.model, ...roster.filter((m) => m.id !== a.model.id && m.id !== b.model.id)].slice(0, 3);
      const wPrompt = `${context}What the person said:\n${question}\n\nDraft A:\n${a.text}\n\nDraft B:\n${b.text}`;
      const wSystem = `${WRITER_SYSTEM(mood)} ${identityPrompt()}\n${moodNote(mood)}`;
      for (const w of writers) {
        if (outer.aborted) break;
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 9_000);
          const r = await deps.registry.once({ model: w, prompt: wPrompt, classification: CLASSIFICATION, params: { maxOutputTokens: 600 }, slot: "panel", system: wSystem, signal: AbortSignal.any([outer, ctl.signal]) });
          clearTimeout(timer);
          const t = r.ok ? cleanDraft(r.text) : "";
          if (t && !looksLeaky(t, question)) { text = t; break; }
        } catch { /* try the next writer */ }
      }
    }
    if (!text && drafts.length) {
      // No writer (or only one draft): the fuller of the drafts, never an error.
      text = [...drafts].sort((x, y) => Math.min(y.text.length, 900) - Math.min(x.text.length, 900))[0].text;
    }
  } catch (e) {
    if (signal?.aborted) throw e;
  } finally {
    clearTimeout(totalTimer);
  }
  const fallback = mood === "neutral" ? "I'm here, and I'm glad you told me. What would help most right now?" : SUPPORT_FALLBACK[mood];
  const markdown = polish(guardVoice(text || fallback));
  const words = markdown.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 6) yield { type: "delta", text: words.slice(i, i + 6).join("") };
  const a = answer(markdown, drafts.map((d) => ({ name: d.model.name, id: d.model.id, provider: d.model.provider })));
  yield { type: "answer", answer: { ...a, durationMs: Date.now() - started } };
}
