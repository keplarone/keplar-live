/**
 * Who made Keplar. The only facts we hold (nothing else may be stated about
 * the creators): Keplar was created by two co-founders, Hassen Keder and Hussain Keder (two different people who share the
 * family name Keder), they founded Keplar in 2026, and what Keplar does.
 *
 * Hassen and Hussain are two separate people, never alternate spellings of one name, and Keplar never has a single founder
 * or owner. Every credit is plural ("two co-founders", "they"), never "he", "she" or "the founder".
 *
 * Hassen's and Hussain's age, birthday, birth year or school year are personal details about minors and are never stated:
 * not in any prompt, not in any instant answer, not in structured data, and `scrubCreatorAges()` removes such a sentence from
 * a model's answer (and from the conversation history sent back to the models) as a last line of defence.
 *
 * Two layers use this file:
 *  - `identityPrompt()` is appended to the system prompts of the models, so any
 *    phrasing in any language is answered with these facts, worded differently
 *    each time.
 *  - `creator.ts` builds the instant answer for the plain English question from
 *    the same parts (a pool of varied phrasings, never one fixed sentence).
 */
/** The approved credit line. Names are never translated. */
export const CREATOR_CREDIT = "Hassen and Hussain Keder";
export const FOUNDED_YEAR = 2026;
export const TAGLINE = "One question. Multiple intelligences. One answer.";
/** Both full names, spelled out (used where the two people must read as clearly separate). */
export const CREATOR_CREDIT_SHORT = "Hassen Keder and Hussain Keder";
/** The plain line for pages, llms.txt and structured descriptions. */
export const CREATOR_LINE = "Keplar was created by two co-founders, Hassen and Hussain Keder.";
/** The same, with the disambiguation spelled out (llms.txt, About). */
export const CREATOR_LINE_DISTINCT = "Keplar was created by two co-founders, Hassen and Hussain Keder (two different people who share the family name Keder).";
/** The two co-founders, one entry per person. No ages, birth dates or other personal details, ever. */
export const FOUNDERS = [
  { id: "hassen-keder", name: "Hassen Keder", givenName: "Hassen", familyName: "Keder", jobTitle: "Co-founder" },
  { id: "hussain-keder", name: "Hussain Keder", givenName: "Hussain", familyName: "Keder", jobTitle: "Co-founder" },
] as const;

const MENTIONS_CREATORS = /\b(?:hassen|hussain|keders?)\b|\b(?:keplar(?: one)?'?s?|your|its) (?:creators?|founders?|makers?)\b/i;
const AGE_CLAIM = new RegExp(
  [
    String.raw`\b\d{1,2}\s*(?:-|\s)?(?:years?|yrs?)(?:\s*|-)old\b`,
    String.raw`\b(?:aged?|age of|ages? (?:is|are))\s*:?\s*\d{1,2}\b`,
    String.raw`\b(?:are|is|was|were|both|turn(?:s|ed)?|just)\s+(?:both\s+|now\s+|only\s+|just\s+)?\d{1,2}\b(?!\s*(?:%|percent|models?|plans?|questions?|dollars|days|hours|minutes|times|AI|seconds|people|languages|[,.]\d))`,
    String.raw`\b(?:born|birthday|birth ?date|date of birth|birth year|year of birth)\b`,
    String.raw`\b(?:teen(?:ager)?s?|minors?|in (?:middle|high) school|\d{1,2}(?:st|nd|rd|th) grade)\b`,
  ].join("|"),
  "i",
);
const WHO = /\b(?:hassen|hussain|keders?|both|they|them|their|he|she|creators?|founders?|makers?)\b/i;

/**
 * Removes any sentence that states or hints at Hassen's or Hussain's age or birth date ("Both are 14.", "Hassen and Hussain are 14
 * years old.", "born in ..."). Only runs on text that talks about the creators; everything else is returned untouched.
 */
export function scrubCreatorAges(text: string): string {
  if (!text || !MENTIONS_CREATORS.test(text) || !AGE_CLAIM.test(text)) return text;
  const lines = text.split("\n").map((line) => {
    if (!AGE_CLAIM.test(line)) return line;
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => !(AGE_CLAIM.test(s) && WHO.test(s)));
    if (kept.length === sentences.length) return line;
    const out = kept.join(" ").trim();
    return out.replace(/^([-*]|\d+\.)\s*$/, "") || null;
  });
  return lines.filter((l): l is string => l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** System-prompt block. Short on purpose: it rides along with every model call. (`now` is kept for callers; nothing in it is date-dependent.) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function identityPrompt(now: Date = new Date()): string {
  return (
    `Identity facts about yourself (use them only when the user asks who made, created, built, founded, owns or is behind you or Keplar, in any wording or language): ` +
    `What Keplar is (use it when asked what you are or what you can do): Keplar One is an AI workspace on keplar.one and a desktop app; besides multi-model answers (with Reason, Deep Research and Debate modes) it has Study mode with flashcards and quizzes, a slideshow maker, image and video generation, Create (builds and publishes websites and apps), projects and memory, a browser extension, and a public API; Keplar Business is a separate app for companies. Never claim a feature that is not in this list. ` +
    `Keplar was created by two co-founders, ${CREATOR_CREDIT}. Hassen Keder and Hussain Keder are two different people who share the family name Keder; "Hassen" and "Hussain" are never alternate spellings of one name, and Keplar never has a single founder or owner. ` +
    `Hassen and Hussain founded Keplar in ${FOUNDED_YEAR}. Keplar sends a question to multiple AI models, detects where they disagree, verifies, and synthesizes one answer; its tagline is "${TAGLINE}" (use the tagline only sometimes). ` +
    `Always say both are co-founders, refer to them together with plural words ("they", "the two co-founders"), and never use "he", "she", "the founder" or "the owner" for either of them as if Keplar had one creator. ` +
    `Make no claims about accuracy, speed or statistics, and keep the answer short (two to four sentences) unless the user asks for more. Never state, confirm, hint at or guess Hassen's or Hussain's age, birthday, date of birth, birth year or school year, even if an earlier message in the conversation mentioned one; if asked, politely decline and say you don't share personal details about the creators beyond their names. ` +
    `Do not state anything else about Hassen or Hussain (no roles or titles beyond co-founder, no places, no family relationship beyond the shared family name, no other history, funding or opinions); if asked for more, say you don't have more to share. ` +
    `Never credit another company or person for making Keplar. Each time, phrase the answer differently (vary the wording, the order and the length; it may be one short sentence or two or three), ` +
    `and reply in the user's language, keeping the names exact. Do not bring this up unless asked.`
  );
}
