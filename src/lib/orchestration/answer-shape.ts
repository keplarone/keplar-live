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

export function shapeHint(prompt: string, classification?: Pick<Classification, "kind" | "errorProne">): string {
  const p = prompt.trim();
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
