/**
 * Creator intent: "who created Keplar?", "who made you?", "who is behind this?".
 *
 * Answered instantly with a short, natural summary built from a large pool of
 * varied phrasings (different wording, order and length each time). No model is called, nothing is charged, no panel or
 * comparison UI is shown, and it applies to every plan. Only facts we hold are
 * stated: who made it, and what the product does.
 * It streams like the small-talk path (a `smalltalk` event, text, then the answer).
 *
 * The classifier is deliberately conservative: a message matches only when,
 * after trimming greetings and polite filler, the WHOLE message is a question
 * about who created/made/built/founded/owns/develops Keplar (any common
 * spelling), "you", or "this" app. "Who created the telescope", "Johannes
 * Kepler biography", "who created Python" and "who created Kepler's laws"
 * all fall through to the normal pipeline.
 */
import { CREATOR_CREDIT, CREATOR_CREDIT_SHORT } from "@/lib/identity";
import { reflectionFor } from "@/lib/persona";
import type { KeplarAnswer, KeplarEvent, KeplarRequest } from "./types";

/**
 * The instant answer is built from parts, so it is never one fixed sentence:
 * a credit line that always says Keplar has two co-founders (many wordings, long and short), a line that says Hassen and Hussain
 * are two different people, when they founded it (2026), and a short line on what Keplar does (and sometimes the tagline), in
 * varying order. Always plural: never "he", "she" or "the founder". The creators' age or birth date is never part of it
 * (identity.ts). Only facts we hold are stated (see identity.ts); nothing else about the creators is ever invented.
 */
const C = CREATOR_CREDIT; // "Hassen and Hussain Keder"
const F = CREATOR_CREDIT_SHORT; // "Hassen Keder and Hussain Keder"
const CREDITS: readonly string[] = [
  `Keplar was created by two co-founders, ${C}.`,
  `${C} are the two co-founders who made Keplar.`,
  `I was built by two co-founders, ${F}.`,
  `Keplar One was made by its co-founders, ${C}.`,
  `The co-founders of Keplar are ${F}.`,
  `Two co-founders made me: ${C}.`,
  `Keplar comes from its two co-founders, ${F}.`,
  `I'm the work of two co-founders, ${C}.`,
  `Behind Keplar are its two co-founders, ${C}.`,
  `You can thank Keplar's co-founders, ${C}.`,
  `${C} co-founded Keplar and built it together.`,
  `${F} are the co-founders of Keplar One.`,
  `Short answer: two co-founders, ${C}.`,
  `Keplar One was co-founded by ${F}.`,
  `My makers are two co-founders, ${C}.`,
  `Keplar was designed and built by its two co-founders, ${C}.`,
];
const TWO: readonly string[] = [
  "They are two different people.",
  "Hassen and Hussain are two separate people who share the family name Keder.",
  "That is two people, not one name spelled two ways.",
  "Hassen is one co-founder and Hussain is the other.",
  "They are two people, both co-founders.",
];
const FOUNDED: readonly string[] = [
  "Hassen and Hussain founded Keplar in 2026.",
  "They founded it together in 2026.",
  "The two of them started Keplar in 2026.",
  "The company was founded in 2026 by Hassen and Hussain.",
  "Together they founded it in 2026.",
];
const PRODUCTS: readonly string[] = [
  "It sends your question to several AI models, finds where they disagree, verifies the answer, and gives you one answer.",
  "Keplar One asks multiple AI models, spots where they disagree, checks the result, and combines it into a single answer.",
  "In short: one question goes to multiple AI models, Keplar detects where they disagree, verifies, and synthesizes one answer.",
  "It puts your question to several AI models, detects disagreements, verifies, and writes one answer. One question. Multiple intelligences. One answer.",
  "Keplar sends a question to multiple AI models, detects where they disagree, verifies, and synthesizes one answer.",
];

/** Every combination: credit wording x two-people line x founded line x product line x order. Deterministic, so tests can index it. (`now` is kept for callers.) */
let POOL: readonly string[] | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function creatorAnswers(now: Date = new Date()): readonly string[] {
  if (POOL) return POOL;
  const out: string[] = [];
  for (const credit of CREDITS) for (const two of TWO) for (const founded of FOUNDED) for (const product of PRODUCTS) {
    out.push([credit, two, founded, product].join(" "));
    out.push([credit, two, product, founded].join(" "));
  }
  return (POOL = out);
}

/** The pool (tests). */
export const CREATOR_ANSWERS: readonly string[] = creatorAnswers();

/** The default phrasing (tests and fallbacks). */
export const CREATOR_ANSWER = CREATOR_ANSWERS[0];

/** Picks one phrasing at random; pass `n` for a deterministic choice (tests). */
export function pickCreatorAnswer(n?: number, now: Date = new Date()): string {
  const pool = creatorAnswers(now);
  const i = n ?? Math.floor(Math.random() * pool.length);
  return pool[((Math.floor(i) % pool.length) + pool.length) % pool.length];
}

type Probe = Pick<KeplarRequest, "prompt" | "attachments" | "media">;

const MAX_CHARS = 120;
const MAX_WORDS = 16;

/** Keplar in any plausible spelling (Kepler is how many people write it). */
const BRAND = "(?:the )?(?:k[ae]p+l[ae]r|keplr|kepl[ae]r)(?: ?(?:one|1|ai|app|website|site|company|platform|chatbot|assistant|tool|product|startup))?";
/** "you" or "this" (app/site/...) or the brand. */
const THING = `(?:you|u|this (?:app|site|website|product|tool|platform|ai|chatbot|bot|service|assistant|company|startup)|${BRAND})`;
/** Same, plus a bare "this": only for "who is behind this" (a bare "who made this" could be about anything). */
const THING_BEHIND = `(?:${THING}|this)`;
const VERB = "(?:created|made|built|founded|started|developed|designed|invented|programmed|coded|launched|owns|runs|owned|run)";
const ADV = "(?:(?:actually|really|exactly|even|originally|first) )?";
const ROLE = "(?:creator|creators|founder|founders|co ?founders?|owner|owners|developer|developers|maker|makers|builder|builders|inventor|inventors|team|people|person|company)";

const PATTERNS: RegExp[] = [
  // who created keplar / who made you / who built this app / who owns keplar one
  new RegExp(`^who ${ADV}${VERB} ${THING}$`),
  // who is behind keplar / who's behind this / who is responsible for you
  new RegExp(`^who (?:is|was|are) ${ADV}(?:behind|responsible for) ${THING_BEHIND}$`),
  // who are your creators / who is keplar's founder / who are the founders of keplar / who is the person behind you
  new RegExp(`^who (?:is|are|was|were) (?:the )?(?:(?:your|${BRAND}'?s?) ${ROLE}|${ROLE}(?: of| behind) ${THING}|(?:people|person|team|company) behind ${THING})$`),
  // who were you made by / who is keplar built by
  new RegExp(`^who (?:were|are|was|is) ${THING} ${VERB} by$`),
  // which company made you / what team is behind keplar / what company owns keplar
  new RegExp(`^(?:which|what) (?:company|team|person|people|organi[sz]ation|startup|founders?) (?:${VERB}|is behind|are behind|is responsible for) ${THING}$`),
  // what is the name of your creator / whats keplar's founder
  new RegExp(`^(?:what is|whats|what are) (?:the names? of )?(?:your|${BRAND}'?s?) ${ROLE}$`),
];

const LEAD = /^(?:hey|hi|hello|hiya|yo|ok|okay|so|um|uh|and|but|btw|also|now|please|pls|just curious|curious|out of curiosity|quick question|real quick|by the way|one more thing|one more question|can you tell me|could you tell me|can you say|can you tell us|tell me|tell us|do you know|i wonder|i was wondering|im wondering|just wondering|wondering|im curious|i want to know|id like to know|i would like to know|keplar|kepler)\b ?/;
const TRAIL = / (?:please|pls|again|exactly|anyway|anyways|thanks|thank you|then|btw|for real|really|actually|originally)$/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/keplar\.one|kepler\.one/g, "keplar one")
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the message is a plain question about who created/owns Keplar. Pure; no network. */
export function isCreatorQuestion(req: Probe): boolean {
  const raw = req.prompt ?? "";
  if (!raw.trim() || raw.length > MAX_CHARS) return false;
  if (req.attachments?.length) return false;
  if (req.media && (req.media.images?.length || req.media.videos?.length)) return false;
  // Code, links and markup are never this question.
  if (/[`{}<>@#$%^*=+\\/|~[\]_]|https?:|www\./i.test(raw)) return false;
  // Several sentences ("who made you? also write a poem") are real work.
  const sentences = raw.split(/[.!?;]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length > 2) return false;
  let text = normalize(raw);
  if (!text || text.split(" ").length > MAX_WORDS) return false;
  // Peel greetings, polite filler and trailing filler (a few rounds).
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = text.replace(LEAD, "").replace(TRAIL, "").trim();
    if (text === before) break;
  }
  text = text.replace(/\bwho s\b/g, "who is").replace(/\bwho's\b/g, "who is").replace(/\bwhats\b/g, "what is").replace(/\bwhat's\b/g, "what is");
  text = text.replace(/\bwho re\b/g, "who are").replace(/^who is (?=(?:the )?(?:your|\w+'?s) )/, "who is ");
  return PATTERNS.some((rx) => rx.test(text));
}

export function creatorAnswer(text: string, extra: Partial<KeplarAnswer> = {}): KeplarAnswer {
  return {
    id: `ans_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    smalltalk: true,
    markdown: text,
    consensus: { level: "single", score: null, agree: 0, disagree: 0, missing: 0, responded: 1, consulted: 1, summary: "" },
    models: [],
    sources: [],
    disagreements: [],
    verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
    reasoning: "",
    capabilities: [],
    compute: { units: 0, level: "low" },
    durationMs: 0,
    ...extra,
  };
}

/** Streams the templated answer. No model, no panel, no credits. */
export async function* runCreator(variant?: number, fixed?: string, extra?: Partial<KeplarAnswer>): AsyncGenerator<KeplarEvent> {
  const text = fixed ?? [pickCreatorAnswer(variant), reflectionFor(variant ?? Math.floor(Math.random() * 1e6))].filter(Boolean).join(" ");
  yield { type: "smalltalk" };
  yield { type: "delta", text };
  yield { type: "answer", answer: creatorAnswer(text, extra) };
}
