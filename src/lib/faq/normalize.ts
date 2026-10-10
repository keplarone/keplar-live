/**
 * "Most frequently asked": what may be counted, and how a counted question is shown. Pure.
 *
 * A question can only be counted when it is general: short, impersonal, and free of anything that could identify a person
 * (links, emails, numbers, secrets, birthdates, addresses, names of the asker, first-person details), and not rude. Two people
 * asking the same thing give the same normalized text, which is what makes it countable at all.
 */
import { looksUnsafe } from "@/lib/memory/facts";
import { redactCase } from "@/lib/learning/redact";
import { guardReply } from "@/lib/orchestration/identity-guards";

/** A question is shown only when this many different signed-in people asked it (k-anonymity). */
export const FAQ_MIN_USERS = Number(process.env.KEPLAR_FAQ_MIN_USERS) > 0 ? Number(process.env.KEPLAR_FAQ_MIN_USERS) : 5;
/** Questions not asked again within this many days drop off the list. */
export const FAQ_WINDOW_DAYS = 60;
/** How many entries the list shows, pinned one included. */
export const FAQ_SLOTS = 5;

export { PINNED_QUESTION, STARTERS } from "./constants";

const PROFANITY = /\b(?:fuck\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|bastard\w*|dick\w*|cock\w*|pussy\w*|slut\w*|whore\w*|nigg\w*|fag\w*|retard\w*|rape\w*|porn\w*|nude\w*|sex\w*|nazi\w*|kill (?:myself|yourself|him|her|them)|suicid\w*)\b/i;
/** First-person details, names and places of the asker, or anything pointing at one person. */
const PERSONAL = /\b(?:my|mine|myself|i|i'm|im|i've|ive|i'll|ill|i'd|me|we|our|us|ours|he|she|him|his|hers|her|they|them|their|name is|called)\b|\bmy\b/i;
/** Looking someone up ("who is …", "how old is …", where they live, their number): a person, not a topic. */
const PEOPLE_LOOKUP = /\b(?:who is|who's|whos|who was|how old is|where does .{1,30} live|address of|phone number of|net worth|is .{1,30} (?:dead|alive|married|dating|gay|straight))\b/;
const QUESTIONISH = /^(?:what|who|whom|whose|when|where|which|why|how|is|are|was|were|do|does|did|can|could|would|should|will|shall|may|might|has|have|had)\b/;

/** lower case, no punctuation, single spaces (curly quotes and accents folded). */
export function foldQuestion(raw: string): string {
  return raw
    .normalize("NFD").replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1").normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The countable form of a question, or null when it may not be counted. */
export function normalizeQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 90) return null;
  if (/[\d@#<>{}[\]\\|`~^*_=+]|https?:|www\./i.test(text)) return null; // digits, links, handles, code
  if (looksUnsafe(text) || redactCase(text) !== text) return null; // secrets, birthdates, addresses, instructions
  if (PROFANITY.test(text)) return null;
  const folded = foldQuestion(text);
  const words = folded.split(" ");
  if (words.length < 3 || words.length > 14) return null;
  if (PERSONAL.test(folded)) return null;
  if (PEOPLE_LOOKUP.test(folded)) return null; // questions about a named person: never listed, however many ask
  if (!QUESTIONISH.test(folded) && !/\?$/.test(text)) return null; // a question, not a command or a statement
  // Fragments that only make sense inside a conversation ("why", "and that one?").
  if (/^(?:why|how|and|but|so|then|what about|what if|really|ok)\b/.test(folded) && words.length < 4) return null;
  return folded;
}

/** How a counted question reads in the list: the words as typed (they passed every filter), sentence case, with a question mark. */
export function displayQuestion(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /\?$/.test(s) ? s : QUESTIONISH.test(foldQuestion(t)) ? `${s}?` : s;
}

/** The pinned question (and its variants) must not appear twice: anything the conscious guard answers is dropped from the counted list. */
export const isConsciousVariant = (norm: string): boolean => guardReply({ prompt: norm }) === "I can not disclose that.";
