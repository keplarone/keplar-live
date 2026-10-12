/**
 * The small-talk classifier on its own ("hi", "thanks", "how are you doing", "who are you", "bye"): pure, with no prompts or model
 * code, so the app page can use it too (Live Research skips small talk) without shipping the reply's system prompt. smalltalk.ts
 * re-exports it and owns the reply.
 *
 * The classifier is deliberately conservative. Anything with a real question, a request, attachments, media, or a mode switched on
 * goes through the full Keplar engine. When in doubt it says "not small talk".
 */
import type { KeplarRequest } from "./types";

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
