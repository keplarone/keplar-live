/**
 * One repair when a quiz request came back as prose. The cheapest routable
 * model rewrites the draft into JSON. The markdown parser runs first, so this
 * call happens only when that parse fails.
 */
import { blendedPrice } from "@/lib/orchestration/pricing";
import { FREE_FALLBACK_ORDER, freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import type { ModelSpec } from "@/lib/orchestration/types";
import { parseMarkdownQuiz } from "./markdown";
import { parseQuiz } from "./schema";
import type { Quiz, QuizAsk } from "./types";

const order = new Map(FREE_FALLBACK_ORDER.map((id, i) => [id, i]));

/** Lowest blended price. Equal prices follow the free fallback order (fastest reliable first). */
export function cheapestModel(models: readonly ModelSpec[], at = new Date().toISOString()): ModelSpec | null {
  const priced = models.filter((m) => m.routable !== false && blendedPrice(m, at) != null);
  if (!priced.length) return null;
  return [...priced].sort((a, b) => {
    const d = (blendedPrice(a, at) ?? 0) - (blendedPrice(b, at) ?? 0);
    if (Math.abs(d) > 1e-9) return d;
    const ia = order.get(a.id) ?? 999;
    const ib = order.get(b.id) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.id < b.id ? -1 : 1;
  })[0]!;
}

/** Free plan: a $0 model. Paid: the cheapest model on the live roster. */
export function cheapestQuizModel(free: boolean, at = new Date().toISOString()): ModelSpec | null {
  return cheapestModel(free ? freeRoster : liveRoster, at);
}

export const QUIZ_REPAIR_SYSTEM = `You repair a quiz into JSON and nothing else. Reply with one JSON object. No markdown, no code fence, no prose.
{"title":"...","kind":"quiz","questions":[{"id":"q1","type":"multiple_choice","prompt":"...","options":["...","...","...","..."],"answer":"...","explanation":"..."}]}
- type is multiple_choice, true_false, or short_answer.
- multiple_choice has exactly 4 options. answer is the correct option's full text, not a letter.
- true_false uses options ["True","False"].
- explanation is one or two sentences copied from the source, at least eight characters.
- Use only facts in the source. If the draft's answer contradicts the source, fix it from the source.
- Keep the draft's questions. Do not add a question that is in neither the draft nor the source.`;

export function quizRepairUser(source: string, draft: string, ask: QuizAsk): string {
  const kind = ask.kind === "flashcards" ? "flashcards" : "quiz";
  return `Kind: ${kind}
Question count: ${ask.count}

Source:
${source.slice(0, 6000)}

Draft answer:
${draft.slice(0, 8000)}`;
}

/** The repair reply, as a quiz. JSON first, then the same markdown parse. */
export function quizFromRepair(text: string, kind: QuizAsk["kind"]): Quiz | null {
  return parseQuiz(text, kind) ?? parseMarkdownQuiz(text, kind);
}
