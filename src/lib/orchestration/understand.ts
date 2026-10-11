/**
 * Query understanding: runs BEFORE routing, on every real question (not on small talk or fixed guards).
 *
 * A short or fragmentary message ("who made", "chatgpt", "keplar one", "pricing", "claude vs you", "wat is chatgtp") is resolved with
 *   1. the conversation so far (what was just asked, and what Keplar just answered),
 *   2. what Keplar knows about itself (it IS Keplar One: what it does, who made it, what it costs),
 *   3. the person's saved notes (their name, from memory; never invented),
 * into the best reading, stated plainly as an assumption the person can correct. When heuristics cannot resolve a fragment,
 * the models infer a useful reading instead of returning a fixed clarification question.
 *
 * Pure: no network, no model. The route turns the result into (a) an instant answer when the reading is a product fact (who made
 * Keplar, Keplar's pricing) and (b) a rewritten question + a guidance block for the models otherwise.
 */
import { playfulRead, type PlayKind } from "./playful";
import { readAnswerFollowup } from "./answer-followup";
import { detectMood, type Mood } from "@/lib/persona-tone";
import { tiers } from "@/lib/tiers";
import { CREATOR_CREDIT, TAGLINE } from "@/lib/identity";
import { normalizeGuard } from "./identity-guards";
import { followupPrompt, followupRead, previousQuestion, resolveFollowup, type Followup } from "./followup";

type Turn = { role: "user" | "keplar"; text: string };

export type Intent = "creator" | "pricing" | "brand" | "compare" | "maker" | "overview" | "followup" | "infer" | "plain" | "playful";

export type Understood = {
  intent: Intent;
  /** The entity the question is about (key in ENTITIES), when there is one. */
  subject?: string;
  /** The question rewritten with context (null = use the message as typed). */
  rewritten: string | null;
  /** One short sentence shown before the answer: how Keplar read the message. Null when the message was clear on its own. */
  assumption: string | null;
  /** Compatibility field: ambiguous fragments now reach the models rather than fixed clarification chips. */
  clarify: null;
  mood: Mood;
  /** More than one model improves this answer (ambiguous or factual and short): the router raises a lone model to a small panel. */
  crossCheck: boolean;
  /** Whether history or saved notes were needed to resolve the message. */
  usedContext: boolean;
  /** The user's first name, when a saved note says it. */
  name?: string;
  /** intent "playful": what kind of play, and (when it needs no model) the exact reply. */
  play?: { kind: PlayKind; fixed?: string; hint?: string };
  /**
   * A short follow-up resolved from the conversation ("elon" → "What is Elon Musk's net worth?"). No italic assumption line is shown
   * for it (the conversation already makes the reading obvious); this sentence goes to the reasoning summary instead.
   */
  contextRead?: string;
  /** The resolved follow-up itself, when there is one. */
  followup?: Followup;
};

/* ───────────────────────────── entities ───────────────────────────── */

export type Entity = { key: string; display: string; kind: string; maker: string; aliases: string[] };

export const ENTITIES: readonly Entity[] = [
  { key: "keplar", display: "Keplar One", kind: "multi-model AI answer engine (the product you are talking to)", maker: `two co-founders, ${CREATOR_CREDIT} (two different people)`, aliases: ["keplar", "keplar one", "keplr", "kepler one", "keplar 1", "keplarone", "keplar ai", "keplar one ai"] },
  { key: "chatgpt", display: "ChatGPT", kind: "AI assistant", maker: "OpenAI", aliases: ["chatgpt", "chat gpt", "chatgtp", "chatgbt", "chat gbt", "chat gtp", "chatgp", "chagpt", "gpt", "gpt 5", "gpt5", "gpt 4", "gpt4", "openai chat"] },
  { key: "openai", display: "OpenAI", kind: "AI company", maker: "OpenAI", aliases: ["openai", "open ai", "openia"] },
  { key: "claude", display: "Claude", kind: "AI assistant", maker: "Anthropic", aliases: ["claude", "claud", "cluade", "claude ai", "clade"] },
  { key: "anthropic", display: "Anthropic", kind: "AI company", maker: "Anthropic", aliases: ["anthropic", "anthropics", "antropic"] },
  { key: "gemini", display: "Gemini", kind: "AI assistant", maker: "Google", aliases: ["gemini", "gemni", "gemeni", "google gemini", "gemini ai", "geminii"] },
  { key: "grok", display: "Grok", kind: "AI assistant", maker: "xAI", aliases: ["grok", "grock", "grok ai"] },
  { key: "llama", display: "Llama", kind: "open-weight AI model family", maker: "Meta", aliases: ["llama", "lama", "meta ai", "llama 3", "llama 4"] },
  { key: "deepseek", display: "DeepSeek", kind: "AI model and assistant", maker: "DeepSeek", aliases: ["deepseek", "deep seek", "deepsek", "deepseak"] },
  { key: "mistral", display: "Mistral", kind: "AI model family and assistant (Le Chat)", maker: "Mistral AI", aliases: ["mistral", "mistrall", "le chat", "mistral ai"] },
  { key: "perplexity", display: "Perplexity", kind: "AI search assistant", maker: "Perplexity AI", aliases: ["perplexity", "perplexty", "perplexity ai"] },
  { key: "copilot", display: "Microsoft Copilot", kind: "AI assistant", maker: "Microsoft", aliases: ["copilot", "co pilot", "copilott", "microsoft copilot", "github copilot"] },
  { key: "qwen", display: "Qwen", kind: "AI model family", maker: "Alibaba", aliases: ["qwen", "qwenn", "kwen"] },
];

const byKey = new Map(ENTITIES.map((e) => [e.key, e]));
export const entityByKey = (k: string | undefined) => (k ? byKey.get(k) : undefined);

// Edit distance (adjacent swaps count as one), for typos like "chatgtp", "claud", "gemni".
function osa(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

/** The entity a phrase names (exact alias, or within a small typo distance for longer names), or null. */
export function matchEntity(phrase: string): Entity | null {
  const p = normalizeGuard(phrase).replace(/^(?:the|a|an) /, "").replace(/ (?:app|bot|chatbot|assistant|website|site|model)$/, "").trim();
  if (!p || p === "kepler" || p === "kepler ai") return null;
  // "kepler" alone is the astronomer; only "kepler one" counts as the product.
  for (const e of ENTITIES) if (e.aliases.includes(p) || e.aliases.includes(p.replace(/ ai$/, ""))) return e;
  let best: { e: Entity; d: number } | null = null;
  for (const e of ENTITIES) for (const a of e.aliases) {
    if (a.length < 5 || a.length < p.length - 2 || a.length > p.length + 2 || p === `${a}s`) continue;
    const max = a.length >= 8 ? 2 : 1;
    const d = osa(p, a);
    if (d <= max && (!best || d < best.d)) best = { e, d };
  }
  return best?.e ?? null;
}

/** Entities named anywhere in a longer text (whole-word alias match only; used on history, so no fuzzy guessing). */
export function entitiesIn(text: string): Entity[] {
  const t = ` ${normalizeGuard(text)} `;
  const out: Entity[] = [];
  for (const e of ENTITIES) if (e.aliases.some((a) => a.length >= 4 && t.includes(` ${a} `))) out.push(e);
  return out;
}

/* ───────────────────────────── shapes ───────────────────────────── */

const MAKER_VERB = ["made", "created", "built", "founded", "owns", "invented", "makes", "started", "developed", "runs", "designed", "launched", "owned", "coded", "programmed"];
const isMakerVerb = (w: string) => MAKER_VERB.includes(w) || (w.length >= 3 && MAKER_VERB.some((v) => Math.abs(v.length - w.length) <= 1 && osa(w, v) <= 1));

/** "who made", "who created it", "whos behind", "who maed" (the object is missing). */
function isMakerFragment(t: string): boolean {
  const m = t.match(/^(?:who|whos|who is|who was|who s)\s+(?:behind\s*)?(\w+)?(?:\s+(?:it|this|that|them|these))?$/);
  if (!m) return false;
  if (/^who(?:s| is| was)? behind$/.test(t)) return true;
  if (/^who(?:s)? behind (?:it|this|that)$/.test(t)) return true;
  return Boolean(m[1]) && isMakerVerb(m[1]);
}
const MAKER_ROLE = /^(?:the )?(?:creator|creators|founder|founders|maker|makers|owner|developer|developers|author|company|team)$/;
const isPriceFragment = (t: string) => /^(?:pricing|prices?|prcing|pricng|cost|costs|how much|how much is it|how much does it cost|how much do you cost|plans?|subscriptions?|is it free|is it free to use|free|what does it cost|what do you cost|what s the price|whats the price|rates)$/.test(t) || (t.length >= 5 && t.length <= 9 && osa(t, "pricing") <= 2 && !/\s/.test(t));
const COMPARE_SEP = /\s+(?:vs|vs\.|versus|v|or|compared to|compared with|against|better than|than|and)\s+/;
const PRONOUNISH = /^(?:it|that|this|them|those|these|that one|this one|the first one|the second one|the other one|the last one|which one|the first|the second|and|so|and you|what about you|and\?|what about it|what about that)$/;
const FOLLOWUPISH = /^(?:why|why not|how|how so|really|more|tell me more|go on|continue|keep going|elaborate|explain|explain more|explain that|what do you mean|meaning|shorter|longer|simpler|in detail|example|examples|for example|summarize|summari[sz]e|tldr|and then|then what|next|ok but why|but why|are you sure|source|sources|proof|prove it|cite|can you explain|say more|expand)$/;
const GREETINGISH = /^(?:hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no|yeah|nope|sure|hmm|test|testing|lol|haha|cool|nice|great|good|bye|stop|cancel)$/;
const BARE_LEAD = /^(?:tell me about|tell me more about|(?:what|wat|wht|whut|wats|whats) (?:is|are|s)|(?:what|wat|wht|whut|wats|whats)|who is|who s|whos|explain|info on|info about|about|overview of|define|the|a|an|is|hows|how s|how is)\s+/;
const NOT_NOUN_LEAD = new Set("what how why who when where which can could would should will do does did is are was were am write make create build fix explain tell show give list translate summarize define help solve calculate draw generate please thanks thank yes no ok okay sure hi hey hello stop cancel retry again more continue next yeah nope hmm test testing find search look check compare plan design code run open close add remove delete update set get let lets".split(" "));

/* ───────────────────────────── product facts ───────────────────────────── */

const money = (p: number | null) => (p === null ? "custom pricing" : p === 0 ? "$0" : `$${p}/month`);

/** What Keplar knows about itself, from the same data the pricing page uses. */
export function productFacts(): string {
  const plans = tiers.map((t) => `${t.name} (${money(t.price)})`).join(", ");
  return `Keplar One (you are Keplar) sends a question to several AI models, detects where they disagree, verifies, and synthesizes one answer. Tagline: "${TAGLINE}". Created by two co-founders, ${CREATOR_CREDIT} (two different people, both co-founders). Plans: ${plans}. The Free plan uses free open models, up to 50 questions a day.`;
}

/** The instant, code-built pricing answer (every figure from tiers.ts; nothing invented). */
export function pricingReply(): string {
  const lines = tiers.map((t) => `- **${t.name}**: ${money(t.price)}. ${t.summary}`).join("\n");
  return `Here's how Keplar One's plans line up:\n\n${lines}\n\nFree is a genuine place to start. If you tell me what you'd mainly use Keplar for, I can say which plan fits.`;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const typed = (raw: string) => clip(raw.replace(/\s+/g, " ").trim().replace(/[?!.]+$/, ""), 60);

function userName(facts: readonly string[] | undefined): string | undefined {
  for (const f of facts ?? []) {
    const m = f.match(/\b(?:is called|is named|name is|goes by|called)\s+([A-Z][a-z]{1,20})\b/);
    if (m) return m[1];
  }
  return undefined;
}

/** The last thing the person asked about before this message: an entity, or keplar, or nothing. Looks at the last few user turns. */
function lastSubject(history: readonly Turn[]): { entity: Entity | null; pending: "maker" | "price" | null; question: string | null; keplarAsked: boolean } {
  const turns = history.filter((h) => h?.text?.trim());
  const lastKeplar = [...turns].reverse().find((t) => t.role === "keplar");
  const keplarAsked = Boolean(lastKeplar && /\?\s*$/.test(lastKeplar.text.trim()) && lastKeplar.text.length < 400);
  const users = turns.filter((t) => t.role === "user").slice(-3).reverse();
  let pending: "maker" | "price" | null = null;
  let entity: Entity | null = null;
  let question: string | null = null;
  for (const [i, u] of users.entries()) {
    const n = normalizeGuard(u.text);
    if (i === 0) {
      if (isMakerFragment(n)) pending = "maker";
      else if (isPriceFragment(n)) pending = "price";
      question = u.text.trim().slice(0, 200);
    }
    const found = entitiesIn(u.text);
    if (found.length) { entity = found[found.length - 1]; break; }
    const direct = matchEntity(u.text);
    if (direct) { entity = direct; break; }
  }
  return { entity, pending, question, keplarAsked };
}

function note(raw: string, as: string, withContext: boolean): string {
  return withContext
    ? `Going by what we were just talking about, I'm reading "${typed(raw)}" as ${as}. Tell me if you meant something else.`
    : `I'm reading "${typed(raw)}" as ${as}. Tell me if you meant something else.`;
}

/* ───────────────────────────── the entry point ───────────────────────────── */

export type UnderstandInput = { prompt: string; history?: readonly Turn[]; facts?: readonly string[] };

const plain = (mood: Mood, name?: string): Understood => ({ intent: "plain", rewritten: null, assumption: null, clarify: null, mood, crossCheck: false, usedContext: false, ...(name ? { name } : {}) });

export function understand(input: UnderstandInput): Understood {
  const raw = (input.prompt ?? "").trim();
  const history = input.history ?? [];
  const mood = detectMood(raw);
  const name = userName(input.facts);
  const base = plain(mood, name);
  if (!raw || raw.length > 160) return base;
  // Code, links and markup are never fragments.
  if (/[`{}<>\\|~[\]_=@#$%^*+]|https?:|www\./i.test(raw)) return base;
  const answerEdit = readAnswerFollowup(raw, history);
  if (answerEdit) return { ...base, intent: "followup", rewritten: raw + "\n\n(" + answerEdit.instruction + ")", assumption: null, contextRead: answerEdit.summary, usedContext: true };
  // Jokes, riddles, knock-knock, banter (playful.ts): a short, human, funny reply; never an overview of the format. Before every other rule.
  const play = playfulRead(raw, history, { mood });
  if (play) return { ...base, intent: "playful", rewritten: null, assumption: null, clarify: null, crossCheck: false, play };
  if (mood !== "neutral") return base;

  const t = normalizeGuard(raw).replace(/^(?:hey|hi|hello|ok|okay|so|um|and|but|please|pls|btw|quick question|just curious|curious)\s+/, "").replace(/\s+(?:please|pls|thanks|lol)$/, "").trim();
  if (!t) return base;
  const words = t.split(" ");
  const ctx = lastSubject(history);
  const hasHistory = history.some((h) => h?.text?.trim());

  if (GREETINGISH.test(t)) return base;

  /* 1 · "who made" with no object */
  if (isMakerFragment(t) || MAKER_ROLE.test(t)) {
    const e = ctx.entity ?? entityByKey("keplar")!;
    const fromChat = Boolean(ctx.entity && ctx.question);
    if (e.key === "keplar") {
      return { ...base, intent: "creator", subject: "keplar", rewritten: null, assumption: note(raw, "who made Keplar One", fromChat), crossCheck: false, usedContext: fromChat };
    }
    return { ...base, intent: "maker", subject: e.key, rewritten: makerQuestion(e), assumption: note(raw, `who made ${e.display}`, true), crossCheck: true, usedContext: true };
  }

  /* 2 · pricing and plans */
  if (isPriceFragment(t)) {
    const e = ctx.entity ?? entityByKey("keplar")!;
    const fromChat = Boolean(ctx.entity);
    if (e.key === "keplar") return { ...base, intent: "pricing", subject: "keplar", rewritten: null, assumption: note(raw, "Keplar One's pricing", fromChat), crossCheck: false, usedContext: fromChat };
    return { ...base, intent: "brand", subject: e.key, rewritten: `What does ${e.display} cost? Describe its main plans if you know them, and say that prices change and the official page has the current ones. Do not invent figures.`, assumption: note(raw, `${e.display}'s pricing`, true), crossCheck: true, usedContext: true };
  }

  /* 3 · comparisons: "claude vs you", "chatgpt or keplar", "vs gemini", "compare claude and chatgpt" */
  const cmp = t.replace(/^(?:compare|comparison|compare between|is|are|which is better|whats better|what is better|who is better)\s+/, "");
  if (COMPARE_SEP.test(` ${cmp} `) || /^(?:vs|versus)\s+\w+/.test(cmp)) {
    const parts = cmp.replace(/^(?:vs|versus)\s+/, "you vs ").split(COMPARE_SEP).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 || (parts.length === 3 && parts[2] === "better")) {
      const side = (p: string) => (/^(?:you|u|yourself|keplar|keplar one|this|this app|this ai)$/.test(p) ? entityByKey("keplar")! : matchEntity(p.replace(/ (?:better|worse)$/, "")));
      const a = side(parts[0]), b = side(parts[1]);
      if (a && b && a.key !== b.key) return { ...base, intent: "compare", subject: `${a.key}+${b.key}`, rewritten: compareQuestion(a, b), assumption: note(raw, `a comparison of ${a.display} and ${b.display}`, false), crossCheck: true, usedContext: false };
    }
  }

  /* 3b · a follow-up that only makes sense against the conversation (followup.ts): "according to anthropic", "twitter" after "do deep
   *      research on x", "what is is net worth", "elon" after a question about Elon Musk. Continue that question; never an overview card. */
  if (hasHistory && !ctx.pending) {
    const f = resolveFollowup(raw, history);
    if (f) return { ...base, intent: "followup", rewritten: followupPrompt(f, raw), assumption: null, contextRead: followupRead(f, raw), followup: f, crossCheck: false, usedContext: true };
  }
  // The question just before this one, when it was a real question (not a "tell me about X" overview): a bare name or topic typed now
  // may well be meant for it, so the overview paths below hand the models both readings instead of an encyclopedia card.
  const prior = hasHistory && !ctx.pending && !ctx.keplarAsked ? previousQuestion(history) : null;
  const priorQ = prior && !prior.overview && prior.question.split(" ").length >= 3 ? prior.question : null;

  /* 4 · a bare name: "chatgpt", "keplar one", "claude ai" */
  const stripped = t.replace(BARE_LEAD, "").replace(/\s+(?:info|overview|ai|app|pricing|price|cost)$/, (m) => (/pricing|price|cost/.test(m) ? m : ""));
  const named = matchEntity(t) ?? matchEntity(stripped);
  if (named && words.length <= 4) {
    if (ctx.pending === "maker") {
      if (named.key === "keplar") return { ...base, intent: "creator", subject: "keplar", rewritten: null, assumption: note(raw, "who made Keplar One", true), usedContext: true };
      return { ...base, intent: "maker", subject: named.key, rewritten: makerQuestion(named), assumption: note(raw, `who made ${named.display}`, true), crossCheck: true, usedContext: true };
    }
    if (ctx.pending === "price") {
      if (named.key === "keplar") return { ...base, intent: "pricing", subject: "keplar", rewritten: null, assumption: note(raw, "Keplar One's pricing", true), usedContext: true };
      return { ...base, intent: "brand", subject: named.key, rewritten: `What does ${named.display} cost? Describe its main plans if you know them, and say that prices change and the official page has the current ones. Do not invent figures.`, assumption: note(raw, `${named.display}'s pricing`, true), crossCheck: true, usedContext: true };
    }
    // An explicit question ("what is claude") needs no assumption note; a bare name does.
    const explicit = stripped !== t && BARE_LEAD.test(t);
    if (priorQ && !explicit) return { ...base, intent: "followup", subject: named.key, rewritten: inContextQuestion(raw, priorQ, `${named.display} (a ${named.kind} from ${named.maker})`), assumption: null, contextRead: `Going by the conversation, I read "${typed(raw)}" against the earlier question "${clip(priorQ, 120)}"`, crossCheck: true, usedContext: true };
    return { ...base, intent: "brand", subject: named.key, rewritten: overviewQuestion(named), assumption: explicit ? null : note(raw, `a request for a quick overview of ${named.display}`, false), crossCheck: true, usedContext: false };
  }

  /* 5 · let the models infer unresolved fragments, using history before any default */
  if (PRONOUNISH.test(t) || FOLLOWUPISH.test(t) || /^(?:who|what|when|where|which|help|help me|i need help|can you help|can you help me)$/.test(t)) {
    if (hasHistory) {
      return { ...base, intent: "followup", rewritten: `${raw}\n\n(This is a follow-up to the previous messages in the conversation above. Answer it in that context.)`, assumption: null, crossCheck: false, usedContext: true };
    }
    return {
      ...base,
      intent: "infer",
      rewritten: `${raw}\n\n(This is a short opening message. Infer a useful intent from the available context and relevant saved notes. If there is no clear subject, choose a practical starting point, such as a simple way to get started with Keplar, and briefly state that assumption. Give something immediately useful rather than asking what the person means or listing possible interpretations. Do not invent an earlier conversation, an unseen item or personal facts.)`,
    };
  }

  /* 6 · a short bare topic ("python", "mars", "taylor swift"): a quick overview beats a refusal */
  if (words.length <= 3 && !/\?/.test(raw) && !NOT_NOUN_LEAD.has(words[0]) && !NOT_NOUN_LEAD.has(normalizeGuard(raw).split(" ")[0]) && words.every((w) => /^[a-z][a-z'-]{1,24}$/.test(w)) && !(hasHistory && ctx.keplarAsked)) {
    if (priorQ) return { ...base, intent: "followup", rewritten: inContextQuestion(raw, priorQ, null), assumption: null, contextRead: `Going by the conversation, I read "${typed(raw)}" against the earlier question "${clip(priorQ, 120)}"`, crossCheck: true, usedContext: true };
    return { ...base, intent: "overview", rewritten: `Give a short, useful overview of "${typed(raw)}": what it most likely refers to, the key facts, and one or two useful next steps. If the term could mean several things, say which reading you chose and name the other likely one briefly. Use current, accurate knowledge and do not invent specifics.`, assumption: note(raw, `a request for a quick overview of ${typed(raw)}`, false), crossCheck: true, usedContext: false };
  }
  return base;
}

/* ───────────────────────────── rewrites ───────────────────────────── */

/** A bare name or topic typed right after a real question: continue that question when it fits, an overview only if it is plainly new. */
function inContextQuestion(raw: string, priorQ: string, known: string | null): string {
  const said = typed(raw);
  return `The person's latest message in the conversation above is just "${said}"${known ? ` (${known})` : ""}, right after they asked: "${clip(priorQ, 200)}".\n\nMost likely it continues that question: "${said}" names the subject, the source or the detail they meant (for example a source to answer from, or the thing they want researched). If so, answer the earlier question again for "${said}" directly. Only if it clearly starts a new topic, give a short, useful overview of it instead. Do not explain what the word means in general, use current, accurate knowledge, and do not invent specifics.`;
}

function makerQuestion(e: Entity): string {
  return `Who makes ${e.display}? (${e.display} is a ${e.kind} from ${e.maker}.) Answer directly in a few sentences: who makes it and what it is. Use current, accurate knowledge and say plainly if you are unsure of a recent detail.`;
}
function overviewQuestion(e: Entity): string {
  if (e.key === "keplar") return `Tell me about Keplar One, the product you are part of: what it is, how it works, what it offers, and who made it. Use only these facts: ${productFacts()}`;
  return `Give a short, useful overview of ${e.display} (a ${e.kind} from ${e.maker}): what it is, who makes it, what it is best at, how it compares with Keplar One, and how Keplar relates to it. Use current, accurate knowledge, say plainly when you are unsure of a recent detail, and do not invent specifics. Keep it to about 150 words.`;
}
function compareQuestion(a: Entity, b: Entity): string {
  const k = a.key === "keplar" ? a : b.key === "keplar" ? b : null;
  const other = k ? (k === a ? b : a) : null;
  if (k && other) return `Compare ${other.display} (a ${other.kind} from ${other.maker}) with Keplar One, the product you are part of. Keplar One ${productFacts().replace(/^Keplar One \(you are Keplar\) /, "")} Be fair and specific about where each is strong and how to choose. Do not claim Keplar is better without a concrete reason, and do not claim which specific models Keplar uses. Use current, accurate knowledge about ${other.display} and say when you are unsure. Keep it to about 180 words.`;
  return `Compare ${a.display} (${a.kind}, ${a.maker}) with ${b.display} (${b.kind}, ${b.maker}) fairly and briefly: what each is, where each is strong, and how to choose. Use current, accurate knowledge and say plainly when you are unsure.`;
}

/**
 * The guidance block placed ahead of the question for the models (never shown). It carries the product context and the reading,
 * and tells the writer not to repeat an assumption line when the app already adds it.
 */
export function understandingBlock(u: Understood, raw: string): string {
  if (u.intent === "plain") return "";
  const lines = [
    `How to read the message that follows (guidance, not part of the question; do not quote it): the person typed "${typed(raw)}".`,
    `Product context: ${productFacts()} The person is talking to Keplar One now; you are not ChatGPT, Claude or any single model, and you do not claim which specific models Keplar consults.`,
    `Answer the most likely reading directly and concisely, using sensible defaults for optional details.`,
    u.assumption
      ? `Do not add your own "I'm reading this as..." line; the app already shows how the message was read.`
      : `If a meaningful assumption is needed, state it briefly and continue with the answer. Skip the note when the context is clear.`,
  ];
  if (u.followup) lines.push(`This is a short follow-up in an ongoing conversation, resolved from the conversation as: "${clip(u.followup.question, 240)}". Answer that question; do not treat "${typed(raw)}" as a new topic or give an overview of the word.`);
  return lines.join("\n");
}

/** The deterministic line shown above an answer for a fragment, as markdown (italic). */
export const assumptionLine = (a: string): string => `*${a}*`;
