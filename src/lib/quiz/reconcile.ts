/**
 * Several models each propose a quiz. A question that validates stays.
 * Agreement keeps it. A disagreement keeps the answer the source supports,
 * or the answer most models gave when the source does not decide (a pasted
 * guide has no file, and dropping those questions is how a 5-question ask
 * came back as one or two). A question that is not in an attached file is
 * dropped. The caller tops up whatever is still short of the asked count.
 */
import { questionSchema, quizSchema } from "./schema";
import { normalizeAnswer } from "./grade";
import type { Quiz, QuizQuestion, QuizVerdict } from "./types";
import type { QuizAsk } from "./types";

const STOP = new Set(
  "that this with from have what when where which your about into they them their there been were will would could should than then also only just some such each other more most very does did make made like over under after before between these those being because while whose into onto upon without within across around among doesn isnt wasnt".split(" "),
);

export function contentWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

export function similarPrompt(a: string, b: string): boolean {
  return jaccard(contentWords(a), contentWords(b)) >= 0.5;
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 1;
}

function overlap(text: string, source: string): number {
  const words = contentWords(text);
  if (!words.length || !source.trim()) return 0;
  const src = source.toLowerCase();
  return words.filter((w) => src.includes(w)).length / words.length;
}

/** The correct answer (or, for true/false, the explanation) is in the source. */
export function answerGrounded(q: QuizQuestion, source: string): boolean {
  if (!source.trim()) return true;
  if (q.type === "true_false") return overlap(q.explanation, source) >= 0.34;
  const words = contentWords(q.answer);
  if (!words.length) return overlap(q.explanation, source) >= 0.4;
  const src = source.toLowerCase();
  const hits = words.filter((w) => src.includes(w)).length;
  return hits >= Math.max(1, Math.ceil(words.length * 0.5));
}

export function questionGrounded(q: QuizQuestion, source: string): boolean {
  if (!source.trim()) return true;
  if (answerGrounded(q, source)) return true;
  return overlap(q.explanation, source) >= 0.4;
}

type Item = { q: QuizQuestion; from: number };

function majority(items: Item[]): Item {
  const by = new Map<string, Item[]>();
  for (const item of items) {
    const key = normalizeAnswer(item.q.answer);
    const arr = by.get(key) ?? [];
    arr.push(item);
    by.set(key, arr);
  }
  let best = items.slice(0, 1);
  for (const arr of by.values()) if (arr.length > best.length) best = arr;
  return best[0]!;
}

function cluster(items: Item[]): Item[][] {
  const groups: Item[][] = [];
  for (const item of items) {
    const hit = groups.find((g) => similarPrompt(item.q.prompt, g[0]!.q.prompt));
    if (hit) hit.push(item);
    else groups.push([item]);
  }
  return groups;
}

function freshId(id: string, seen: Set<string>): string {
  let next = id.slice(0, 40) || "q";
  let n = 2;
  while (seen.has(next)) {
    const suffix = `-${n++}`;
    next = `${id.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
  }
  seen.add(next);
  return next;
}

function pack(questions: QuizQuestion[], opts: { title: string; sourceName?: string; kind: QuizAsk["kind"] }): Quiz | null {
  const seen = new Set<string>();
  const unique = questions.map((q) => ({ ...q, id: freshId(q.id, seen) }));
  if (!unique.length) return null;
  const quiz = {
    title: opts.title,
    ...(opts.sourceName ? { source: opts.sourceName } : {}),
    kind: opts.kind,
    questions: unique,
  };
  const parsed = quizSchema.safeParse(quiz);
  return parsed.success ? parsed.data : null;
}

/**
 * Merge quizzes from the panel. `source` is the attached file text (empty when
 * there is no file). A disagreement keeps the source-backed answer, or the
 * majority answer when the source does not decide.
 */
export function reconcileQuizzes(quizzes: Quiz[], opts: { source: string; count: number; kind: QuizAsk["kind"]; sourceName?: string; title?: string }): Quiz | null {
  const items: Item[] = [];
  quizzes.forEach((quiz, i) => quiz.questions.forEach((q) => items.push({ q, from: i })));
  if (!items.length) return null;
  const kept: QuizQuestion[] = [];
  for (const group of cluster(items)) {
    const byAnswer = new Map<string, Item[]>();
    for (const item of group) {
      const key = normalizeAnswer(item.q.answer);
      const arr = byAnswer.get(key) ?? [];
      arr.push(item);
      byAnswer.set(key, arr);
    }
    if (byAnswer.size <= 1) {
      const q = group[0]!.q;
      if (questionGrounded(q, opts.source)) kept.push(q);
      continue;
    }
    const grounded = [...byAnswer.values()].filter((arr) => answerGrounded(arr[0]!.q, opts.source));
    if (grounded.length >= 1) {
      kept.push(majority(grounded.flat()).q);
      continue;
    }
    if (!opts.source.trim()) kept.push(majority(group).q);
  }
  const title = opts.title || quizzes.find((q) => q.title && q.title !== "Quiz" && q.title !== "Flashcards")?.title || (opts.kind === "flashcards" ? "Flashcards" : "Quiz");
  return pack(kept.slice(0, opts.count), { title, sourceName: opts.sourceName ?? quizzes.find((q) => q.source)?.source, kind: opts.kind });
}

/** Verifier says a key is wrong: drop it, or replace it only when the replacement is in the source and (for choices) one of the options. */
export function applyQuizVerdicts(quiz: Quiz, verdicts: QuizVerdict[] | undefined, source: string): Quiz | null {
  if (!verdicts?.length) return quiz;
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const questions: QuizQuestion[] = [];
  for (const q of quiz.questions) {
    const v = byId.get(q.id);
    if (!v || v.verdict === "keep") {
      questions.push(q);
      continue;
    }
    if (v.verdict === "drop") continue;
    const answer = (v.answer ?? "").replace(/\s+/g, " ").trim();
    if (!answer) continue;
    const next: QuizQuestion = { ...q, answer };
    if (q.options?.length) {
      const hit = q.options.find((o) => normalizeAnswer(o) === normalizeAnswer(answer));
      if (!hit) continue;
      next.answer = hit;
    }
    if (source && !answerGrounded(next, source)) continue;
    const one = questionSchema.safeParse(next);
    if (one.success) questions.push(one.data);
  }
  if (!questions.length) return null;
  const parsed = quizSchema.safeParse({ ...quiz, questions });
  return parsed.success ? parsed.data : null;
}
