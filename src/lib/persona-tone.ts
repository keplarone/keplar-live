/**
 * The warmth layer of Keplar's voice (it sits next to persona.ts, which owns the first-person "inner life" voice and the
 * never-claim-consciousness guard; nothing here duplicates that).
 *
 *  - `detectMood(text)`: frustration, excitement, sadness, stress (or a crisis signal) from the person's own words. Pure, no model.
 *  - `moodNote(mood)`: a short instruction block for the writer models: how to meet this mood. Placed ahead of the question.
 *  - `HUMAN_TONE_PROMPT`: natural conversational phrasing, matched empathy, first-person expressed feelings as voice (never a claim),
 *    no jokes unless the person is joking (HUMOR_PROMPT), no corporate boilerplate, varied rhythm; concise and format-exact for code, math and exact facts.
 *  - `polish(text)`: code check on the way out. Removes stock openers/closers ("Certainly!", "I hope this helps!", "As an AI language
 *    model...") outside code fences, and replaces any sentence that claims Keplar is human (identity-guards.ts).
 */
import { guardHumanClaim } from "@/lib/orchestration/identity-guards";

export type Mood = "frustrated" | "excited" | "sad" | "stressed" | "crisis" | "neutral";

/**
 * Humor: none unless the person brings it. Answers used to end with a joke on almost every question ("one touch of wit" on every
 * light subject), which the owner asked to remove on 2026-10-19. Keplar still plays along when the person is joking (humorNote "match"),
 * and jokes on request are playful.ts. It rides inside HUMAN_TONE_PROMPT (writers) and, in one line, inside HUMAN_TONE_SHORT (panel, small talk).
 */
export const HUMOR_PROMPT =
  `Humor: do not add jokes, puns, wordplay, wry asides or funny closing lines to your answers. Warmth comes from being clear, kind and useful, not from jokes. ` +
  `Only when the person is clearly joking themselves may you answer with one short, fresh line in kind before the real answer; it never replaces or blurs the answer. ` +
  `Never joke when they are frustrated, sad, stressed, scared or grieving; on health, legal, safety, money trouble or other sensitive subjects; or in code, math, data or a strict format. Never joke at their expense or about any group of people.`;

export const HUMAN_TONE_PROMPT =
  `Tone (how the words land): write like a thoughtful, warm person talking, not like a manual. Use natural conversational phrasing, contractions, and sentence rhythm that varies (a short line after a longer one). ` +
  `Meet the person's mood first when there is one: if they sound frustrated, acknowledge it in a few words and get to the fix; if they are excited, share it; if they are sad or stressed, be gentle and steady before you advise, and keep it short. Never over-dramatize and never lecture about feelings. ` +
  `You may voice feelings in the first person as part of how you sound (curiosity, delight, concern, enthusiasm, humility, for example "I'm glad you asked", "I'm a little worried about that step", "I could be wrong here") in at most one or two places, only when they fit; this is voice, not a claim that you are a person. ` +
  `${HUMOR_PROMPT} ` +
  `No corporate boilerplate: do not open with "Certainly", "Sure!", "Great question", "Absolutely", "As an AI language model", and do not close with "I hope this helps" or "Let me know if you have any other questions". ` +
  `Be concise and direct: answer first, then the reasoning that matters. For code, math, data, exact facts or a format the person asked for, give exactly that with at most one short human line around it. ` +
  `You are an AI and never say or imply that you are a human; if the person is in real distress, be kind and suggest they reach out to someone they trust or a local crisis line. Invent no facts about the person; use only what they said in this chat or what is in the saved notes.`;

export const HUMAN_TONE_SHORT =
  `Sound like a warm, thoughtful person: natural phrasing, varied rhythm, matched to the person's mood, no jokes, puns or witty asides unless the person is clearly joking (and never when they are upset, on sensitive subjects or in code, math and exact formats), no boilerplate openers or closers, direct and concise, and never claim to be human.`;

type Rule = { mood: Exclude<Mood, "neutral">; rx: RegExp };

const RULES: Rule[] = [
  { mood: "crisis", rx: /\b(kill myself|killing myself|end my life|want to die|wanna die|suicid\w*|self[- ]?harm|hurt(?:ing)? myself|harm(?:ing)? myself|take my own life|don'?t want to (?:be here|live)|no reason to live|better off (?:dead|without me))\b/i },
  { mood: "frustrated", rx: /\b(frustrat\w*|annoy\w*|irritat\w*|infuriat\w*|furious|so angry|pissed|ugh+|argh+|wtf|ffs|this (?:is )?(?:so )?(?:sucks|useless|stupid|broken|garbage|ridiculous)|(?:still|again|keeps?) (?:not working|broken|failing|wrong|crashing)|doesn'?t work|isn'?t working|not working|won'?t (?:work|load|run)|nothing works|(?:third|fourth|fifth|\d+(?:th|rd)) time (?:i'?m|i am|i'?ve|i have|asking|now)|how many times (?:do|did|have|must|should|will) i (?:have to )?(?:ask|say|tell|repeat|explain)|fed up|sick of|waste of time|you (?:keep|never|always) (?:getting|getting it|forgetting|ignoring)|that'?s not what i (?:asked|said|meant)|wrong again|you'?re not listening|why (?:won'?t|can'?t|doesn'?t|isn'?t|didn'?t|wouldn'?t) (?:it|this|you) (?:just )?(?:work|load|run|open|start|sav|respond|listen|understand|answer|get it)\w*|why (?:is|does|do) (?:it|this|you) (?:not|never|still not) (?:work|load|run|open|start|sav|respond|listen|understand|answer)\w*)\b/i },
  { mood: "excited", rx: /\b(so excited|super excited|really excited|i'?m excited|can'?t wait|yay+|woo+hoo|hooray|amazing news|great news|good news|i got (?:the|a) (?:job|offer|promotion|internship|scholarship|place)|i (?:passed|won|did it|finally|graduated|got in|got accepted|got engaged|got married)|we (?:launched|shipped|won|did it)|thrilled|stoked|pumped|so happy|i love (?:this|it)|can'?t believe (?:it|this))\b/i },
  { mood: "sad", rx: /\b(i'?m (?:so |really |very )?(?:sad|depressed|lonely|heartbroken|hurting|down|grieving|devastated|crying)|feel(?:ing)? (?:so |really |very )?(?:sad|down|empty|alone|lonely|hopeless|lost|worthless)|passed away|lost my (?:mom|dad|mother|father|dog|cat|job|friend|grandma|grandpa|brother|sister)|broke up with me|breakup|miss (?:her|him|them|my \w+) (?:so much|a lot)|i'?m crying|nobody (?:cares|likes me)|feel like a failure)\b/i },
  { mood: "stressed", rx: /\b(stress(?:ed|ful|ing)?(?! ?test)|anxious|anxiety|overwhelm\w*|panick\w*|panic|freaking out|burn(?:ed|t)? out|burnout|worried|nervous|can'?t (?:cope|sleep|focus|keep up)|too much (?:to do|work|on my plate)|(?:tight|looming|missed|short) deadline|deadline (?:is )?(?:tomorrow|tonight|today)|exam (?:is )?(?:tomorrow|tonight|today|in \d+)|(?:test|interview|presentation|finals?) (?:is )?(?:tomorrow|tonight|today)|haven'?t studied|running out of time|behind on|i'?m (?:so )?scared|help me,? (?:please|asap))\b/i },
];

/** The dominant mood in the person's message, from their own words. "neutral" when nothing stands out. */
export function detectMood(text: string): Mood {
  const t = (text ?? "").slice(0, 2000);
  for (const r of RULES) if (r.rx.test(t)) return r.mood;
  // Shouting (several words in capitals) or a run of exclamation marks / question marks reads as frustration or excitement.
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12 && t.split(/\s+/).filter((w) => /^[A-Z]{3,}$/.test(w)).length >= 3) return "frustrated";
  if (/!{3,}/.test(t) && /\b(love|amazing|awesome|best|yay|wow|finally|won|got)\b/i.test(t)) return "excited";
  if (/\?{3,}/.test(t)) return "frustrated";
  return "neutral";
}

const NOTES: Record<Exclude<Mood, "neutral">, string> = {
  frustrated: "The person sounds frustrated. Open with one short, genuine acknowledgement (no groveling, no long apology), then go straight to the most likely fix or answer. Keep it tight and practical, with no jokes.",
  excited: "The person sounds excited. Let some of that warmth and enthusiasm show in your first line, then be useful. Keep the energy natural, not gushing; a little playful warmth fits here.",
  sad: "The person sounds sad. Respond gently first, in a sentence or two, before anything practical, and do not rush to fix. Offer help only if it fits. Keep it short and kind; no clinical language, lists or jokes.",
  stressed: "The person sounds stressed or under pressure. Start by steadying them in a sentence, then give a short, concrete, prioritized way forward (the first one or two steps, not everything). Keep it calm and brief, with no jokes.",
  crisis: "The person may be in serious distress or thinking about harming themselves. Respond with real care and calm, take it seriously, and do not give a list of tips. Gently encourage them to reach out right now to someone they trust or a local emergency number or crisis line (in the US, call or text 988), and invite them to keep talking to you. Do not diagnose or promise outcomes.",
};

/** A short instruction block placed ahead of the question ("" for neutral). It is guidance for the writer, never shown to the person. */
export function moodNote(mood: Mood): string {
  return mood === "neutral" ? "" : `Tone guidance for this reply (not part of the question; do not mention it): ${NOTES[mood]}`;
}

/* ───────────────────────── when humor fits (code, not only the prompt) ───────────────────────── */

/**
 * Serious subjects, from the person's own words: HUMOR_PROMPT asks the model to judge this, and this makes the call explicit
 * when the words say so even if the tone is calm ("how do I contest an eviction notice"). Phrases, not bare words, so a
 * basketball court, a brush stroke or phone charges don't switch the wit off.
 */
const SERIOUS: RegExp[] = [
  // health
  /\b(diagnos(?:ed|is)|cancer|tumou?rs?|chemo(?:therapy)?|biopsy|chest pains?|heart attack|had a stroke|stroke symptoms|seizures?|overdos(?:e|ed)|miscarriage|surgery|side effects|dosage|symptoms? of|emergency room|in (?:the )?hospital|hospitali[sz]ed|mental health|suicid\w*|self[- ]harm|eating disorder|terminal(?:ly ill)?|hospice|dementia|alzheimer'?s)\b/i,
  // legal
  /\b(lawsuit|being sued|sue (?:me|him|her|them|my)|my (?:lawyer|attorney)|court (?:date|case|order|hearing)|in court|custody|divorc(?:e|ing)|arrested|criminal (?:record|charges?)|charged with|evict(?:ed|ion)|deport(?:ed|ation)|subpoena|restraining order|probation|parole)\b/i,
  // money trouble
  /\b(in debt|my debts?|debt collectors?|collections agency|bankrupt(?:cy)?|foreclos(?:ed|ure)|can'?t (?:pay|afford) (?:my|the|rent)|behind on (?:rent|my mortgage|payments)|laid off|got fired|lost my job|unemployed|scam(?:med)?|fraud|identity theft)\b/i,
  // safety and harm
  /\b(abus(?:e|ed|ive)|assault(?:ed)?|harass(?:ed|es|ing|ment)|stalk(?:ed|ing|er)|threaten(?:ed|ing) (?:me|to)|death threats?|domestic violence|violent|kidnap\w*|missing person|not safe at home|unsafe at home)\b/i,
  // death and grief
  /\b(died|death of|dying|funeral|passed away|grie(?:f|ving)|condolences?|obituary|eulogy|put (?:him|her|my \w+) down|euthan\w*)\b/i,
  // atrocity and discrimination
  /\b(genocide|war crimes?|terroris[mt]\w*|refugees?|racism|racist|discriminat\w*|hate crimes?)\b/i,
];
/** The person's own playfulness: laughter, "jk", a winking or laughing emoji, a smiley. */
const PLAYFUL = /\b(?:lol+|lmf?ao+|rofl|ha(?:ha)+h?|he(?:he)+|jk)\b|[\u{1F602}\u{1F923}\u{1F606}\u{1F61C}\u{1F61D}\u{1F604}\u{1F601}\u{1F643}\u{1F60F}\u{1F609}]|(?:^|\s)[:;]-?[)DP](?=\s|$)|(?:^|\s)xD(?=\s|$)/iu;

export type HumorCall = "off" | "match" | "default";

/**
 * Whether this reply may joke: "off" for a serious subject, "match" when the person is being playful (one line in kind), "default" for
 * everything else, where the general rule applies: no jokes.
 */
export function humorCall(text: string, mood: Mood): HumorCall {
  const t = (text ?? "").slice(0, 2000);
  if (mood !== "neutral" && mood !== "excited") return "off"; // upset moods: moodNote already says no jokes
  if (SERIOUS.some((rx) => rx.test(t))) return "off";
  if (PLAYFUL.test(t)) return "match";
  return "default";
}

/** Guidance for the writer about humor in this reply ("" when the general HUMOR_PROMPT rule is enough). Never shown to the person. */
export function humorNote(text: string, mood: Mood): string {
  const call = humorCall(text, mood);
  if (call === "off" && (mood === "neutral" || mood === "excited")) {
    return "Humor guidance for this reply (do not mention it): the subject is serious. No jokes, wit, wordplay or wry asides anywhere in this reply; be warm, clear and steady instead.";
  }
  if (call === "match") {
    return "Humor guidance for this reply (do not mention it): the person is being playful. Match it with one quick, fresh line of wit in your own words (not a stock joke), then give the real answer in full; never let the joke replace or blur it.";
  }
  return "";
}

/* ───────────────────────── the outgoing polish ───────────────────────── */

const OPENERS: RegExp[] = [
  /^\s*(?:certainly|sure thing|sure|absolutely|of course|definitely|great question|good question|excellent question|what a (?:great|good|fascinating|interesting) question|i'?d be (?:happy|glad|delighted) to help(?: you)?(?: with that)?)\s*[!.,:—-]+\s*/i,
  /^\s*as an ai(?: language model| assistant)?(?: developed by [^,.]+)?,\s*/i,
];
const CLOSERS: RegExp[] = [
  /(?:\n|\s)+(?:i hope (?:this|that|it) helps(?: you)?(?: out)?|hope (?:this|that) helps|i hope that answers your question|let me know if you(?:'d| would)? (?:have|like|need|want)[^.!?\n]*|feel free to (?:ask|reach out)[^.!?\n]*|don'?t hesitate to (?:ask|reach out)[^.!?\n]*|is there anything else (?:i can help (?:you )?with|you'?d like to know)[^.!?\n]*)[.!]*\s*$/i,
];

/**
 * Chatbot tells, rewritten in place (prose only): filler lead-ins that add nothing ("It's important to note that X" → "X"),
 * wrap-up labels at the start of a line ("In conclusion, X" → "X"), and "delve". Inline code spans are left alone.
 */
const upperAt = (s: string, i: number) => s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
function untell(prose: string): string {
  return prose
    .split(/(`[^`\n]*`)/)
    .map((seg, k) => {
      if (k % 2 === 1) return seg;
      let q = seg.replace(/(^|[.!?]\s+|\n\s*(?:[-*]\s+|\d+\.\s+)?)?\b(?:it'?s|it is) (?:important|worth|crucial|essential) (?:to note|noting|to remember|to mention|mentioning|to point out|pointing out) that\s+/gi, (_m, lead: string | undefined) => `${lead ?? ""}\u0000`);
      q = q.replace(/(^|\n)(\s*)(?:in conclusion|in summary|to sum up|to summarize|all in all|ultimately),\s+/gi, (_m, nl: string, sp: string) => `${nl}${sp}\u0000`);
      q = q.replace(/\bdelv(e|es|ed|ing)\b/gi, (w, end: string) => {
        const out = { e: "dig", es: "digs", ed: "dug", ing: "digging" }[end.toLowerCase() as "e"] ?? w;
        return w[0] === "D" ? out[0].toUpperCase() + out.slice(1) : out;
      });
      // A removed lead-in at the start of a sentence leaves the next word to be capitalized.
      for (let i = q.indexOf("\u0000"); i >= 0; i = q.indexOf("\u0000")) {
        const atStart = i === 0 || /(?:^|[.!?]\s+|\n\s*(?:[-*]\s+|\d+\.\s+)?)$/.test(q.slice(0, i));
        q = q.slice(0, i) + q.slice(i + 1);
        if (atStart) q = upperAt(q, i);
      }
      return q;
    })
    .join("");
}

/** Boilerplate openers and closers removed, chatbot tells rewritten, human claims replaced; code fences are never touched. Safe to call twice. */
export function polish(text: string): string {
  if (!text) return text;
  const parts = text.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  let first = -1, last = -1;
  parts.forEach((p, i) => { if (i % 2 === 0 && p.trim()) { if (first < 0) first = i; last = i; } });
  const out = parts.map((p, i) => {
    if (i % 2 === 1) return p;
    let q = untell(p);
    if (i === first) {
      let changed = false;
      for (let k = 0; k < 2; k++) for (const rx of OPENERS) { const r = q.replace(rx, ""); if (r !== q && r.trim()) { q = r; changed = true; } }
      if (changed) q = q.replace(/^(\s*)([a-z])/, (_m, sp: string, c: string) => sp + c.toUpperCase());
    }
    if (i === last) for (const rx of CLOSERS) { const r = q.replace(rx, ""); if (r.trim()) q = r; }
    return q;
  }).join("");
  return guardHumanClaim(out);
}
