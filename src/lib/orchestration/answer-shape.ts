import type { Classification } from "./types";

/**
 * Small free models answer a comparison or a how-to in one dense paragraph (measured on the live Free plan: a Postgres-vs-MySQL question
 * came back as two paragraphs, 66 words, with no criteria). A short instruction about the SHAPE of the answer fixes that without asking for
 * more words: verdict first, then the few things that decide it. Pure and keyed on the wording of the question; it never applies to quick
 * facts, exact checks, or messages too short to be a real request.
 */
const COMPARE = /\b(compare|comparison|versus|vs\.?|difference between|differences|pros and cons|which (?:is|one is|should i)\b|should i (?:use|choose|pick|buy|lease|get|go with|learn|pay|invest|take)|better (?:for|than|to)|or should|how (?:should|do|can) i (?:decide|choose|pick)|decide between|weigh)\b/i;
const HOWTO = /\b(how (?:can|do|should|would|could) (?:i|you|we)|how to|(?:good |best |quick |easy |simple |fast |safe |cheap )?ways? to|get rid of|ideas? for|tips? (?:for|to|on)|steps? to|plan (?:a|my|for|the)|roadmap|checklist|guide to|get started|improve my|grow my)\b/i;
const EXPLAIN = /\b(explain|how does|how do|why does|why do|why is|what happens|teach me|help me understand|eli5|walk me through|for (?:a|my) (?:test|exam|class))\b/i;
const WRITE = /\b(write|draft|rewrite|compose)\b.*\b(email|e-mail|letter|note|message|post|essay|cover letter|bio|description|speech|text|reply)\b/i;

const HOWTO_HINT = "Answer shape: a numbered list of practical steps or ideas, most effective first, each with a bold lead and one concrete detail (an amount, a time or an example). One closing line only if it adds something. Under about 250 words, no filler.";

/**
 * "How do I ...?" asked as a task to carry out (fix a leaking tap, set up a Next.js app, file a tax return, bake sourdough): the person
 * wants to DO it, so the answer is a complete, deep step-by-step guide, not a 250-word list. Not "how does X work" (an explanation),
 * not "how many/much/long/old" (a fact), not "how do you feel/say/spell" (talk), not "ideas/tips/ways to" (a list of options).
 */
const GUIDE = /\b(?:how (?:do|can|should|would|could|will|might) (?:i|we|one|you|someone|people) (?!(?:\w+ )?(?:feel|think|know|like|mean|say|pronounce|spell|define|look|doing|work|compare|decide|choose|pick|tell if|do\b|are\b|stay\b)\b)(?:\w+ )?\w+|how (?:to|would i go about|do i go about|should i go about)\b|what(?:'s| is| are)? (?:the |a )?(?:best |good |right |proper |correct |easiest |fastest |safest |quickest )?(?:way|steps|process|procedure) (?:to|for)\b|steps? (?:to|for)\b|step[- ]by[- ]step|walk me through|teach me (?:how|to)\b|show me how\b|(?:guide|tutorial|instructions?|walkthrough) (?:to|for|on|how)\b|help me (?:set ?up|install|configure|fix|build|make|create|replace|repair|install|migrate|deploy|write|start|clean|cook|bake|plant|train)\b|i (?:want|need|would like) to (?:learn how to|know how to)\b)/i;
const NOT_GUIDE = /^\s*(?:how (?:many|much|long|old|far|big|tall|often|come|likely|accurate|true)\b|how (?:does|do|did|is|are|was|were) (?!i\b|we\b|one\b|you\b)\w+(?: \w+){0,4} (?:work|happen|form|function|evolve)\b)/i;

export function isGuideRequest(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 8 || p.length > 1500 || p.split(/\s+/).length < 3) return false;
  return GUIDE.test(p) && !NOT_GUIDE.test(p);
}

/** What every panel model is told for a how-to (and, adapted, the writer of the final answer: GUIDE_SYNTH_RULES in live-synthesizer.ts). */
export const GUIDE_HINT = `Answer shape: a complete, expert step-by-step guide, deeper and more practical than any other assistant would give, so someone who has never done this succeeds on the first try.
Scale the depth to the task: a one-line fix gets the fix plus how to confirm it worked; a real project gets the full guide below. Never pad.
Structure (markdown, use these parts when they apply, skip the ones that don't):
1. One or two sentences: what they will end up with, roughly how long it takes, the difficulty, and the cost when it matters. If you had to assume their setup (operating system, version, country, skill level, budget), say the assumption in one line here instead of asking.
2. "**Before you start**": everything needed (tools, materials with amounts and sizes, accounts, software with versions, permissions), what to check first, and any safety warning that matters (electricity, gas, chemicals, heat, money, data loss, legal), in bold.
3. "**Steps**": a numbered list in the exact order to do them. Each step: a bold action title; then exactly what to do, with the specific details people get wrong (exact menu paths and button names, commands and code in fenced code blocks with the language, settings and values, quantities, temperatures, sizes, torque, timings, where to click or look); one short line on why when it isn't obvious; and a "*Check:*" line saying what they should see, hear, measure or get when the step worked. Split big steps into lettered sub-steps (a, b, c). Point out the step where most people go wrong, and how to avoid it.
4. Where it really differs, a short variation for the other common case (Windows vs macOS, gas vs electric, beginner vs experienced budget), not a full second guide.
5. "**If something goes wrong**": the most likely problems as "symptom → cause → fix", specific to this task.
6. "**Pro tips**": two to five things experts know that most guides leave out (shortcuts, quality upgrades, how to make it last, how to save money or time).
7. One line on what to do next or how to maintain it, only if useful.
If the humor guidance asks for a touch of wit, it goes in the overview sentence or the final line, never inside a step, a warning, a value or a command.
Be exact and truthful: never invent a menu name, command, part number, setting or value you are not confident of; when it depends on the version or model, say what to look for instead. When a professional is genuinely needed (gas lines, mains wiring in many places, structural work, medical or legal steps), say so plainly at the point it matters. No preamble, no closing offer; as long as the task needs (often 500 to 1,500 words) and no longer.`;

export function shapeHint(prompt: string, classification?: Pick<Classification, "kind" | "errorProne">): string {
  const p = prompt.trim();
  // How-to guides first: they apply to code tasks too ("how do I set up ESLint in Next.js"), but never to exact checks (counting, arithmetic).
  if (classification?.errorProne !== "exact" && isGuideRequest(p)) return GUIDE_HINT;
  if (p.split(/\s+/).length < 6 || p.length > 1500) return "";
  if (classification?.errorProne || classification?.kind === "code") return "";
  // A "how do I" question is often classed as factual (a wine stain is not a quick fact); only the how-to shape applies to those.
  if (classification?.kind === "factual" && !HOWTO.test(p)) return "";
  if (classification?.kind === "factual") return HOWTO_HINT;
  if (WRITE.test(p)) return "Answer shape: give the finished text first, ready to use, then at most one short line offering a change. Do not explain what you did.";
  if (COMPARE.test(p)) return "Answer shape: open with a one-sentence verdict or recommendation. Then a short list of the 3 to 5 things that decide it, each with a bold label and one concrete line (a number, a cost or an example where you have one). Then when to choose each option. Under about 250 words, no filler.";
  if (HOWTO.test(p)) return HOWTO_HINT;
  if (EXPLAIN.test(p)) return "Answer shape: one plain sentence that gives the idea, then the key parts or steps as a short list, then one concrete example. Define any term you must use. Under about 250 words, no filler.";
  return "";
}
