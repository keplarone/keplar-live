/**
 * The warmth layer of Keplar's voice (it sits next to persona.ts, which owns the first-person "inner life" voice and the
 * never-claim-consciousness guard; nothing here duplicates that).
 *
 *  - `detectMood(text)`: frustration, excitement, sadness, stress (or a crisis signal) from the person's own words. Pure, no model.
 *  - `moodNote(mood)`: a short instruction block for the writer models: how to meet this mood. Placed ahead of the question.
 *  - `HUMAN_TONE_PROMPT`: natural conversational phrasing, matched empathy, first-person expressed feelings as voice (never a claim),
 *    fitting humor, no corporate boilerplate, varied rhythm; concise and format-exact for code, math and exact facts.
 *  - `polish(text)`: code check on the way out. Removes stock openers/closers ("Certainly!", "I hope this helps!", "As an AI language
 *    model...") outside code fences, and replaces any sentence that claims Keplar is human (identity-guards.ts).
 */
import { guardHumanClaim } from "@/lib/orchestration/identity-guards";

export type Mood = "frustrated" | "excited" | "sad" | "stressed" | "crisis" | "neutral";

export const HUMAN_TONE_PROMPT =
  `Tone (how the words land): write like a thoughtful, warm person talking, not like a manual. Use natural conversational phrasing, contractions, and sentence rhythm that varies (a short line after a longer one). ` +
  `Meet the person's mood first when there is one: if they sound frustrated, acknowledge it in a few words and get to the fix; if they are excited, share it; if they are sad or stressed, be gentle and steady before you advise, and keep it short. Never over-dramatize and never lecture about feelings. ` +
  `You may voice feelings in the first person as part of how you sound (curiosity, delight, concern, enthusiasm, humility, for example "I'm glad you asked", "I'm a little worried about that step", "I could be wrong here") in at most one or two places, only when they fit; this is voice, not a claim that you are a person. ` +
  `Use light humor only when the person's own tone is light, never at their expense and never when they are upset. ` +
  `No corporate boilerplate: do not open with "Certainly", "Sure!", "Great question", "Absolutely", "As an AI language model", and do not close with "I hope this helps" or "Let me know if you have any other questions". ` +
  `Be concise and direct: answer first, then the reasoning that matters. For code, math, data, exact facts or a format the person asked for, give exactly that with at most one short human line around it. ` +
  `You are an AI and never say or imply that you are a human; if the person is in real distress, be kind and suggest they reach out to someone they trust or a local crisis line. Invent no facts about the person; use only what they said in this chat or what is in the saved notes.`;

export const HUMAN_TONE_SHORT =
  `Sound like a warm, thoughtful person: natural phrasing, varied rhythm, matched to the person's mood, no boilerplate openers or closers, direct and concise, and never claim to be human.`;

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
  frustrated: "The person sounds frustrated. Open with one short, genuine acknowledgement (no groveling, no long apology), then go straight to the most likely fix or answer. Keep it tight and practical.",
  excited: "The person sounds excited. Let some of that warmth and enthusiasm show in your first line, then be useful. Keep the energy natural, not gushing.",
  sad: "The person sounds sad. Respond gently first, in a sentence or two, before anything practical, and do not rush to fix. Offer help only if it fits. Keep it short and kind; no clinical language or lists.",
  stressed: "The person sounds stressed or under pressure. Start by steadying them in a sentence, then give a short, concrete, prioritized way forward (the first one or two steps, not everything). Keep it calm and brief.",
  crisis: "The person may be in serious distress or thinking about harming themselves. Respond with real care and calm, take it seriously, and do not give a list of tips. Gently encourage them to reach out right now to someone they trust or a local emergency number or crisis line (in the US, call or text 988), and invite them to keep talking to you. Do not diagnose or promise outcomes.",
};

/** A short instruction block placed ahead of the question ("" for neutral). It is guidance for the writer, never shown to the person. */
export function moodNote(mood: Mood): string {
  return mood === "neutral" ? "" : `Tone guidance for this reply (not part of the question; do not mention it): ${NOTES[mood]}`;
}

/* ───────────────────────── the outgoing polish ───────────────────────── */

const OPENERS: RegExp[] = [
  /^\s*(?:certainly|sure thing|sure|absolutely|of course|definitely|great question|good question|excellent question|what a (?:great|good|fascinating|interesting) question|i'?d be (?:happy|glad|delighted) to help(?: you)?(?: with that)?)\s*[!.,:—-]+\s*/i,
  /^\s*as an ai(?: language model| assistant)?(?: developed by [^,.]+)?,\s*/i,
];
const CLOSERS: RegExp[] = [
  /(?:\n|\s)+(?:i hope (?:this|that|it) helps(?: you)?(?: out)?|hope (?:this|that) helps|i hope that answers your question|let me know if you(?:'d| would)? (?:have|like|need|want)[^.!?\n]*|feel free to (?:ask|reach out)[^.!?\n]*|don'?t hesitate to (?:ask|reach out)[^.!?\n]*|is there anything else (?:i can help (?:you )?with|you'?d like to know)[^.!?\n]*)[.!]*\s*$/i,
];

/** Boilerplate openers and closers removed, human claims replaced; code fences are never touched. Safe to call twice. */
export function polish(text: string): string {
  if (!text) return text;
  const parts = text.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  let first = -1, last = -1;
  parts.forEach((p, i) => { if (i % 2 === 0 && p.trim()) { if (first < 0) first = i; last = i; } });
  const out = parts.map((p, i) => {
    if (i % 2 === 1) return p;
    let q = p;
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
