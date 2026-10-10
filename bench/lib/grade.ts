/**
 * Grading (plan §4.4).
 * - Multiple choice: deterministic letter match, no judge.
 * - Short answers: two judges from families in neither panel (GLM-5.3, Mistral Medium 3.5)
 *   with the official templates (HLE judge for HLE-Diamond; SimpleQA correct / incorrect /
 *   not-attempted for SimpleQA Verified, FRAMES and Fresh Claims). Disagreement → Qwen tie-break;
 *   still unresolved → "needs-human" (scored incorrect until a human decides).
 * - The grader sees only the question, the gold answer and the final answer: never the arm
 *   or any model name. Identical final answers are graded once (cache).
 */
import { HELPER_TEMPERATURE, JUDGES, REASONING_EFFORT, ROLE_MAX_TOKENS } from "./config";
import { extractLetter } from "./parse";
import type { Ctx } from "./pipeline";
import * as P from "./prompts";
import { hashStr } from "./rng";
import type { ArmResult, Grade, Item, Verdict } from "./types";

export function parseHleVerdict(text: string): Verdict | null {
  const m = text.match(/correct\s*:\s*\**\s*(yes|no)\b/i);
  return m ? (m[1].toLowerCase() === "yes" ? "correct" : "incorrect") : null;
}

export function parseSimpleQaVerdict(text: string): Verdict | null {
  const t = text.trim().replace(/^[*"'`\s]+/, "");
  const letter = t.match(/^([ABC])\b/);
  if (letter) return ({ A: "correct", B: "incorrect", C: "not_attempted" } as const)[letter[1] as "A" | "B" | "C"];
  if (/NOT[_\s]ATTEMPTED/i.test(t)) return "not_attempted";
  if (/\bINCORRECT\b/i.test(t)) return "incorrect";
  if (/\bCORRECT\b/i.test(t)) return "correct";
  return null;
}

export const templateFor = (item: Item): "hle" | "simpleqa" => (item.dataset === "hle-diamond" ? "hle" : "simpleqa");

async function oneJudge(ctx: Ctx, model: string, item: Item, response: string, predicted: string | null): Promise<Verdict | null> {
  const tpl = templateFor(item);
  const prompt = tpl === "hle" ? P.hleJudgePrompt(item.question, response, item.answer) : P.simpleQaGraderPrompt(item.question, response, item.answer);
  const res = await ctx.call(
    { modelId: model, role: "grade", system: "You are a strict, impartial grader.", prompt, maxTokens: ROLE_MAX_TOKENS.grade, reasoningEffort: REASONING_EFFORT.grade, temperature: HELPER_TEMPERATURE, run: 0, mock: { item, run: 0, predicted, template: tpl } },
    hashStr(prompt).toString(36),
  );
  if (!res.ok) return null;
  return tpl === "hle" ? parseHleVerdict(res.text) : parseSimpleQaVerdict(res.text);
}

export async function gradeResult(ctx: Ctx, item: Item, r: ArmResult): Promise<Grade> {
  if (item.answerType === "mc") {
    const letter = r.declined ? null : extractLetter(r.answer);
    return { verdict: letter == null ? "not_attempted" : letter === item.answer.trim().toUpperCase() ? "correct" : "incorrect", method: "letter", judges: [] };
  }
  // HLE has no not-attempted label; an explicit decline is scored not_attempted (= not correct) without a judge call.
  if (r.declined && templateFor(item) === "hle") return { verdict: "not_attempted", method: "letter", judges: [] };
  // Graders see only the final answer string (same input shape for every arm).
  const response = r.declined || !r.answer ? "I don't know" : r.answer;
  const predicted = r.declined ? null : r.answer;
  const [a, b] = JUDGES.primary;
  const [va, vb] = await Promise.all([oneJudge(ctx, a, item, response, predicted), oneJudge(ctx, b, item, response, predicted)]);
  const judges: Grade["judges"] = [{ model: a, verdict: va }, { model: b, verdict: vb }];
  if (va && va === vb) return { verdict: va, method: "dual-judge", judges };
  const vc = await oneJudge(ctx, JUDGES.tiebreak, item, response, predicted);
  judges.push({ model: JUDGES.tiebreak, verdict: vc });
  const votes = [va, vb, vc].filter((v): v is Verdict => v != null);
  const counts = new Map<Verdict, number>();
  votes.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const winner = [...counts.entries()].find(([, n]) => n >= 2);
  if (winner) return { verdict: winner[0], method: "tiebreak", judges };
  return { verdict: "incorrect", method: votes.length ? "needs-human" : "error", judges };
}
