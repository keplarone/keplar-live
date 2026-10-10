/**
 * Every prompt the harness sends. Pre-register this file together with config.ts.
 *
 * - Answer prompts are identical for every arm (plan §2: "All arms get identical
 *   question text and the same answer-format instruction"). Keplar's panel uses
 *   the same answer prompt, which is what makes panel-output reuse valid (plan §2, arms 1–5).
 * - HLE-Diamond uses the official HLE answer system prompt verbatim, so single-model
 *   scores stay comparable to the CAIS numbers. The other sets use the same format
 *   and explicitly allow "I don't know" (SimpleQA-style abstention).
 * - Grader templates are the official ones, loaded from bench/prompts/.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Item, Position } from "./types";

export const BENCH_DIR = join(__dirname, "..");

const HLE_EXACT_SYSTEM =
  "Your response should be in the following format:\nExplanation: {your explanation for your final answer}\nExact Answer: {your succinct, final answer}\nConfidence: {your confidence score between 0% and 100% for your answer}";
const HLE_MC_SYSTEM =
  "Your response should be in the following format:\nExplanation: {your explanation for your answer choice}\nAnswer: {your chosen answer}\nConfidence: {your confidence score between 0% and 100% for your answer}";
const OPEN_SYSTEM =
  "Answer the question. Your response should be in the following format:\nExplanation: {a brief explanation}\nAnswer: {your succinct, final answer, or exactly \"I don't know\" if you are not reasonably sure}\nConfidence: {your confidence score between 0% and 100% for your answer}";
const MC_SYSTEM =
  "Answer the multiple-choice question. Your response should be in the following format:\nExplanation: {a brief explanation}\nAnswer: {the single letter of your chosen option}\nConfidence: {your confidence score between 0% and 100% for your answer}";

export function answerSystem(item: Item): string {
  if (item.dataset === "hle-diamond") return item.answerType === "mc" ? HLE_MC_SYSTEM : HLE_EXACT_SYSTEM;
  return item.answerType === "mc" ? MC_SYSTEM : OPEN_SYSTEM;
}

export const answerPrompt = (item: Item) => item.question;

/* ─────────────── Keplar pipeline stages (mirror src/lib/orchestration roles) ─────────────── */

const letters = (n: number) => Array.from({ length: n }, (_, i) => `Response ${i + 1}`);

/** Responses are shown anonymised (no model names) to every downstream stage. */
export function formatResponses(answers: string[]): string {
  const names = letters(answers.length);
  return answers.map((a, i) => `### ${names[i]}\n${a.trim()}`).join("\n\n");
}

export const EXTRACT_SYSTEM = `You group short answers that mean the same thing.
Return ONLY JSON: {"positions":[{"answer":string,"responses":[number,...]}]}
- "responses" are the 1-based response numbers holding that answer.
- Two answers are the same position only if a strict grader would accept either for the other.
- A response that declines or says it doesn't know is NOT a position; leave it out.`;

export function extractPrompt(item: Item, finalAnswers: (string | null)[]): string {
  const lines = finalAnswers.map((a, i) => `Response ${i + 1}: ${a ?? "(declined / no answer)"}`);
  return `Question:\n${item.question}\n\nFinal answers:\n${lines.join("\n")}`;
}

export const VERIFY_SYSTEM = `You review a draft answer against several independent responses to the same question.
Check the reasoning, contradictions and unsupported claims inside the responses only. Do not use outside sources.
Return ONLY JSON: {"verdict":"held"|"revised","answer":string,"support":number,"disputed":[string,...]}
- "answer": the answer you think is best supported (the draft's answer if it holds).
- "support": 0 to 1, how well the responses' reasoning supports that answer.
- "disputed": up to 3 short, checkable factual claims that the responses disagree on (empty if none).`;

export function verifyPrompt(item: Item, responses: string[], draft: string): string {
  return `Question:\n${item.question}\n\n${formatResponses(responses)}\n\nDraft answer: ${draft}`;
}

export const JUDGE_SYSTEM = `The responses below disagree. Weigh the evidence and reasoning in each and decide the best final answer.
Return ONLY JSON: {"answer":string,"confidence":number,"rationale":string}
- "confidence": 0 to 1. If no answer is reasonably supported, set "answer" to "I don't know".`;

export function judgePrompt(item: Item, responses: string[], positions: Position[], review: string): string {
  const pos = positions.map((p, i) => `Position ${i + 1}: ${p.answer} (held by ${p.models.length} response(s))`).join("\n");
  return `Question:\n${item.question}\n\n${formatResponses(responses)}\n\nPositions:\n${pos}\n\nReviewer notes:\n${review}`;
}

/** Same system prompt as the app's retriever (src/lib/orchestration/retriever.ts). */
export const RETRIEVE_SYSTEM = `You check one disputed claim against the web search results provided to you.
Return ONLY JSON: {"outcome":"supported"|"contradicted"|"inconclusive","finding":string,"resolution":string}
Base the outcome only on the search results. If they don't clearly settle it, answer "inconclusive". One sentence per field.`;

export const retrievePrompt = (claim: string) => `Claim: ${claim}`;

export function synthesizeSystem(item: Item): string {
  return `You write Keplar's single final answer from the evidence below.\n${answerSystem(item)}`;
}

export function synthesizePrompt(item: Item, responses: string[], positions: Position[], notes: string[]): string {
  const pos = positions.map((p, i) => `Position ${i + 1}: ${p.answer} (${p.models.length} of ${responses.length} responses)`).join("\n") || "(no position)";
  return `Question:\n${item.question}\n\n${formatResponses(responses)}\n\nPositions:\n${pos}\n\nReview and checks:\n${notes.join("\n") || "(none)"}`;
}

/* ─────────────── graders (official templates) ─────────────── */

let hleTpl: string | null = null;
let sqaTpl: string | null = null;

export function hleJudgePrompt(question: string, response: string, gold: string): string {
  hleTpl ??= readFileSync(join(BENCH_DIR, "prompts", "hle_judge.txt"), "utf8");
  return hleTpl.replace("{question}", () => question).replace("{response}", () => response).replace("{correct_answer}", () => gold);
}

export function simpleQaGraderPrompt(question: string, predicted: string, gold: string): string {
  sqaTpl ??= readFileSync(join(BENCH_DIR, "prompts", "simpleqa_grader.txt"), "utf8");
  return sqaTpl.replace("{question}", () => question).replace("{target}", () => gold).replace("{predicted_answer}", () => predicted);
}
