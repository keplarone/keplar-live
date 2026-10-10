/**
 * Recall questions answered from what is stored, with no model and no cost (like the creator question):
 *
 *   - "What did we talk about last time / in my last chat / yesterday / last week?"  -> from the saved chat summaries.
 *   - "What did I just ask?" / "What was my last question?"                           -> from this conversation's own history.
 *
 * The classifier is conservative: the WHOLE message must be the question (greetings and filler peeled off).
 * "What did the Beatles do last time they toured?" or "What did we agree about the budget?" go to the models.
 */
import type { KeplarRequest } from "@/lib/orchestration/types";
import { flat } from "./context";
import type { DigestMeta } from "./digest";

export type RecallIntent =
  | { kind: "past"; when: "last" | "yesterday" | "today" | "week" }
  | { kind: "just-asked" };

type Probe = Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">;

const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ").replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();

const LEAD = /^(?:(?:hey|hi|hello|ok|okay|so|and|but|also|please|pls|keplar|kepler|now|just|quick question|can you|could you|would you|will you|do you|can u|i was wondering|im wondering|just wondering|wondering)\b[ ,]*)+/;
const TRAIL = /(?: (?:please|pls|again|thanks|thank you|for me|real quick|quickly|exactly))+$/;

/** Talking about the conversation itself, in the first person. */
const SUBJECT = /\b(?:we|i|us|you and i|our|my)\b/;
const TALK = /\b(?:talk(?:ed|ing)?|discuss(?:ed|ing)?|chat(?:ted|ting)?|spoke|speak|speaking|cover(?:ed)?|work(?:ed|ing)? on|ask(?:ed)?|conversation|chat|session|recap|summar(?:y|ize|ise)|remember|recall|leave off|left off|stop(?:ped)?)\b/;
const ASKS = /^(?:what|which|whats|what's|remind me|tell me|recap|summari[sz]e|where|remember|recall|you remember|any memory)\b/;

const LAST = /\b(?:last|previous|prior|most recent|latest) (?:time|chat|conversation|session|thread|one)\b|\bour last\b|\bmy last (?:chat|conversation|session|thread)\b|\bbefore this (?:chat|conversation)\b|\bleft off\b|\bleave off\b|\bwhere were we\b|\bwhere did we stop(?:ped)?\b/;
const YESTERDAY = /\byesterday\b/;
const TODAY = /\b(?:earlier today|today)\b/;
const WEEK = /\b(?:last week|this week|past week|the other day|recently)\b/;

/** Questions about this conversation's own earlier message. */
const JUST_ASKED = /^(?:what|whats|what's|which) (?:was|is|did|were) (?:the )?(?:(?:my|the) (?:last|previous|prior|latest) (?:question|message|prompt|ask|request|query)(?: (?:to you|before this(?: one)?|just now|just before this(?: one)?))?|(?:i|me) (?:just )?(?:ask|asked|say|said|type|typed|write|wrote|send|sent)(?: you)?(?: (?:just now|a moment ago|a second ago|before this(?: one)?|right before this(?: one)?|earlier))?|(?:i|me) (?:just )?(?:ask|asked) (?:you )?(?:just now|a moment ago|before))$/;
const REPEAT_LAST = /^(?:repeat|show|read back|say) (?:my|the) (?:last|previous) (?:question|message|prompt)$/;

/** The recall question in a message, or null. Pure; no network. */
export function recallIntent(req: Probe): RecallIntent | null {
  const raw = req.prompt ?? "";
  if (!raw.trim() || raw.length > 200) return null;
  if (req.attachments?.length) return null;
  if (req.media && (req.media.images?.length || req.media.videos?.length)) return null;
  if (req.modes && Object.values(req.modes).some(Boolean)) return null;
  if (/[`{}<>\\|~[\]]|https?:|www\./i.test(raw)) return null;
  if (raw.split(/[.!?;]+/).map((s) => s.trim()).filter(Boolean).length > 2) return null;
  let text = norm(raw);
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = text.replace(LEAD, "").replace(TRAIL, "").trim();
    if (text === before) break;
  }
  if (!text || text.split(" ").length > 16) return null;
  text = text.replace(/\bwhat's\b/g, "what is").replace(/\bwhats\b/g, "what is");
  if (JUST_ASKED.test(text) || REPEAT_LAST.test(text)) return { kind: "just-asked" };
  if (!ASKS.test(text) || !SUBJECT.test(text) || !TALK.test(text)) return null;
  if (YESTERDAY.test(text)) return { kind: "past", when: "yesterday" };
  if (LAST.test(text)) return { kind: "past", when: "last" };
  if (WEEK.test(text)) return { kind: "past", when: "week" };
  if (TODAY.test(text) && /\b(?:other|earlier|before|already|previous)\b|\btoday\b.*\b(?:chat|conversation|talk)/.test(text)) return { kind: "past", when: "today" };
  return null;
}

/* ───────────────────────────── answers ───────────────────────────── */

export const RECALL_SIGNED_OUT = "I can only look back at earlier chats when you're signed in. Chats you have while signed out aren't saved or remembered after you leave. Sign in and I can tell you what we talked about last time.";
export const RECALL_OFF = "Memory is turned off, so I'm not keeping or looking at summaries of your past chats. Say \"turn memory on\" or switch it on in Account → Memory, and I'll start remembering from then.";
export const RECALL_NONE = "I don't have a saved earlier chat to look back at yet. Once you've had a chat while signed in with memory on, I can tell you what it was about.";

/** The calendar day (YYYY-MM-DD) of a time in a zone; falls back to UTC for an unknown zone. */
export function dayKey(ms: number, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  }
}

export const validTz = (tz: unknown): string | undefined => {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(tz)) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
};

/** "Thursday, Oct 1" in the user's zone. */
export function dayLabel(ms: number, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "long", month: "short", day: "numeric" }).format(ms);
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(ms);
  }
}

const entry = (d: DigestMeta) => `"${flat(d.title, 70)}": ${flat(d.summary, 300)}`;

/**
 * The reply for a "past" recall from the stored digests (any order; `currentId` is left out).
 * Pure: `nowMs` and the zone are passed in.
 */
export function recallReply(when: "last" | "yesterday" | "today" | "week", all: readonly DigestMeta[], opts: { currentId?: string; nowMs?: number; tz?: string } = {}): string {
  const nowMs = opts.nowMs ?? Date.now();
  const tz = opts.tz;
  const rows = all.filter((d) => d.id !== opts.currentId && d.summary && d.turns > 0).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!rows.length) return RECALL_NONE;
  if (when === "last") {
    const [d, ...rest] = rows;
    const extra = rest.length ? ` I have ${rest.length} older saved ${rest.length === 1 ? "chat" : "chats"} too; ask about yesterday or last week, or open History.` : "";
    return `Last time (${dayLabel(d.updatedAt, tz)}), in ${entry(d)}${extra}`;
  }
  const today = dayKey(nowMs, tz);
  const yesterday = dayKey(nowMs - 24 * 3600 * 1000, tz);
  const within = (d: DigestMeta) => {
    if (when === "yesterday") return dayKey(d.updatedAt, tz) === yesterday;
    if (when === "today") return dayKey(d.updatedAt, tz) === today;
    return d.updatedAt >= nowMs - 7 * 24 * 3600 * 1000;
  };
  const hits = rows.filter(within).slice(0, 6);
  const word = when === "yesterday" ? "yesterday" : when === "today" ? "earlier today" : "in the last week";
  if (!hits.length) {
    const last = rows[0];
    return `I don't have a saved chat from ${word === "in the last week" ? "the last week" : word}. The most recent one I have is from ${dayLabel(last.updatedAt, tz)}: ${entry(last)}`;
  }
  if (hits.length === 1) return `${when === "yesterday" ? "Yesterday" : when === "today" ? "Earlier today" : "In the last week"} (${dayLabel(hits[0].updatedAt, tz)}) we talked in ${entry(hits[0])}`;
  return `${when === "yesterday" ? "Yesterday" : when === "today" ? "Earlier today" : "In the last week"} we had ${hits.length} chats:\n${hits.map((d) => `- ${when === "week" ? `${dayLabel(d.updatedAt, tz)}, ` : ""}${entry(d)}`).join("\n")}`;
}

/** The reply for "what did I just ask?" from this conversation's own history. */
export function justAskedReply(history: KeplarRequest["history"]): string {
  const users = (history ?? []).filter((h) => h.role === "user" && h.text.trim());
  const last = users[users.length - 1];
  if (!last) return "This is the start of our chat, so you haven't asked me anything yet before this.";
  const text = last.text.replace(/\s+/g, " ").trim();
  return `Your previous message was: "${text.length > 600 ? `${text.slice(0, 599).trimEnd()}…` : text}"`;
}
