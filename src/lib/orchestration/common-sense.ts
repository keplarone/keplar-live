/**
 * Common-sense guardrails for questions a too-literal reading gets absurdly wrong.
 *
 * "Is Elon Musk projected to die in the next 400 years?" was answered "he is not projected to die within 400 years", because no
 * actuarial "projection" says so. Every person alive today will die within such a horizon; the honest answer says so plainly
 * (with life extension mentioned only as speculative). This module spots those questions and adds one guidance line for the models.
 *
 * Pure: no network, no model. Returns "" for everything else.
 */

/** The oldest verified human lifespan is about 122 years; anything past ~125 years from now outlives everyone alive today. */
const MAX_LIFESPAN = 125;

const MORTALITY = /\b(?:die|dies|died|dying|dead|death|pass away|passes away|alive|still be alive|live|living|be around|survive|outlive|still exist)\b/i;
const PERSON_WORDS = /\b(?:he|she|him|her|they|i|me|you|my|your|his|we|us|our|people|person|human|humans|anyone|everyone|someone|somebody|mr|mrs|ms|dr|my (?:mom|dad|kids?|children|family))\b/i;
/** A capitalised two-word name ("Elon Musk"), checked case-sensitively. */
const CAPITAL_NAME = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/;
/** "is elon musk projected to die", "will taylor swift be alive": a two- or three-word lowercase subject before a mortality verb. */
const NAMED_SUBJECT = /^(?:is|will|does|can|could|would|are)\s+(?!the\b|a\b|an\b|earth\b|humanity\b)([a-z]+(?:\s+[a-z]+){1,2})\s+(?:ever\s+)?(?:be\s+|going to\s+|gonna\s+|projected to\s+|expected to\s+|likely to\s+|predicted to\s+|still\s+)*(?:die|live|be alive|alive|survive|be dead|dead|pass away)\b/i;
const personish = (p: string) => PERSON_WORDS.test(p) || CAPITAL_NAME.test(p) || NAMED_SUBJECT.test(p.trim());

function horizonYears(text: string): number | null {
  const t = text.toLowerCase().replace(/,(?=\d{3})/g, "");
  const n = t.match(/\b(\d{2,7})\s*(?:\+\s*)?(?:years?|yrs?)\b/);
  if (n) return Number(n[1]);
  if (/\b(?:millenni(?:um|a)|thousand years)\b/.test(t)) return 1000;
  const c = t.match(/\b(\d{1,3}|two|three|four|five|ten)\s+centur(?:y|ies)\b/);
  if (c) {
    const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, ten: 10 };
    return (Number(c[1]) || words[c[1]] || 1) * 100;
  }
  if (/\b(?:by|in|before|until|till|to|past) (?:the year )?(2[2-9]\d\d|[3-9]\d\d\d)\b/.test(t)) {
    const y = Number(t.match(/\b(2[2-9]\d\d|[3-9]\d\d\d)\b/)![1]);
    return y - new Date().getUTCFullYear();
  }
  return null;
}

/** One guidance line for the models, or "" when the question needs none. */
export function commonSenseNote(prompt: string): string {
  const p = (prompt ?? "").slice(0, 400);
  if (!MORTALITY.test(p) || !personish(p)) return "";
  const years = horizonYears(p);
  if (years === null || years < MAX_LIFESPAN) return "";
  return `Common sense for this question (guidance, do not quote it): no human has lived much past 120 years, so any person alive today is all but certain to die within ${years} years. Say that plainly; mention radical life extension only as unproven speculation, and do not read "projected" or "expected" so literally that you deny the obvious.`;
}
