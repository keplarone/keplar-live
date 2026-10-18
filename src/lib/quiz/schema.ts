/**
 * Validate a quiz the model returned. Zod checks the shape; a question that
 * doesn't fit is dropped. No valid question means no quiz (the markdown stands).
 */
import { z } from "zod";
import type { Quiz, QuizQuestion, QuizQuestionType } from "./types";

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["multiple_choice", "true_false", "short_answer"]),
  prompt: z.string().min(1).max(600),
  options: z.array(z.string().min(1).max(240)).min(2).max(6).optional(),
  answer: z.string().min(1).max(400),
  explanation: z.string().min(8).max(500),
  hint: z.string().min(1).max(240).optional(),
});

export const quizSchema = z.object({
  title: z.string().min(1).max(140),
  source: z.string().min(1).max(200).optional(),
  kind: z.enum(["quiz", "flashcards"]),
  questions: z.array(questionSchema).min(1).max(20),
});

function questionType(raw: string): QuizQuestionType | null {
  const t = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (t === "multiplechoice" || t === "mc" || t === "mcq" || t === "choice") return "multiple_choice";
  if (t === "truefalse" || t === "tf" || t === "boolean") return "true_false";
  if (t === "shortanswer" || t === "short" || t === "open" || t === "freetext") return "short_answer";
  if (t === "true_false" || t === "short_answer" || t === "multiple_choice") return t;
  return null;
}

function resolveChoice(answer: string, options: string[]): string | null {
  const exact = options.find((o) => o.toLowerCase() === answer.toLowerCase());
  if (exact) return exact;
  const letter = /^([a-f])(?:\s*[.)]|\s|$)/i.exec(answer.trim());
  if (letter && answer.trim().length <= 3) {
    const i = letter[1].toLowerCase().charCodeAt(0) - 97;
    return options[i] ?? null;
  }
  if (/^[1-6]$/.test(answer.trim())) return options[Number(answer.trim()) - 1] ?? null;
  return null;
}

function asQuestion(v: unknown, n: number): QuizQuestion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const type = questionType(typeof o.type === "string" ? o.type : "");
  const prompt = clean(typeof o.prompt === "string" ? o.prompt : typeof o.question === "string" ? o.question : "", 600);
  const explanation = clean(typeof o.explanation === "string" ? o.explanation : "", 500);
  if (!type || !prompt || explanation.length < 8) return null;
  const hint = clean(typeof o.hint === "string" ? o.hint : "", 240);
  const id = clean(typeof o.id === "string" ? o.id : `q${n}`, 40) || `q${n}`;
  if (type === "short_answer") {
    const answer = clean(typeof o.answer === "string" ? o.answer : "", 400);
    if (!answer) return null;
    const q: QuizQuestion = { id, type, prompt, answer, explanation, ...(hint ? { hint } : {}) };
    return questionSchema.safeParse(q).success ? q : null;
  }
  const options = (Array.isArray(o.options) ? o.options : type === "true_false" ? ["True", "False"] : [])
    .map((x) => clean(typeof x === "string" ? x : "", 240))
    .filter(Boolean)
    .slice(0, 6);
  if (type === "true_false" && options.length < 2) options.splice(0, options.length, "True", "False");
  if (options.length < 2) return null;
  const rawAnswer = clean(typeof o.answer === "string" ? o.answer : typeof o.correct === "string" ? o.correct : "", 400);
  let answer = resolveChoice(rawAnswer, options);
  if (!answer && type === "true_false") {
    if (/^t|true|yes/i.test(rawAnswer)) answer = options.find((x) => /^t/i.test(x)) ?? "True";
    else if (/^f|false|no/i.test(rawAnswer)) answer = options.find((x) => /^f/i.test(x)) ?? "False";
  }
  if (!answer) return null;
  const q: QuizQuestion = { id, type, prompt, options, answer, explanation, ...(hint ? { hint } : {}) };
  return questionSchema.safeParse(q).success ? q : null;
}

/** Pull a JSON value out of a fence body. Trailing commas are tolerated; anything else is rejected. */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let str = false;
  let esc = false;
  for (let k = start; k < raw.length; k++) {
    const c = raw[k];
    if (str) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') str = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(start, k + 1);
        try {
          return JSON.parse(slice);
        } catch {
          try {
            return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1"));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Schema-check one quiz object. Invalid questions are dropped. Null when nothing valid remains
 * (the caller keeps the markdown).
 */
export function parseQuiz(raw: string, kind: "quiz" | "flashcards" = "quiz"): Quiz | null {
  const json = extractJson(raw);
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const list = Array.isArray(o.questions) ? o.questions : Array.isArray(json) ? (json as unknown[]) : null;
  if (!list) return null;
  const seen = new Set<string>();
  const questions: QuizQuestion[] = [];
  for (const item of list.slice(0, 20)) {
    const q = asQuestion(item, questions.length + 1);
    if (!q) continue;
    let id = q.id;
    while (seen.has(id)) id = `${id}-${questions.length + 1}`;
    seen.add(id);
    questions.push({ ...q, id });
  }
  if (!questions.length) return null;
  const title = clean(typeof o.title === "string" ? o.title : "", 140) || (kind === "flashcards" ? "Flashcards" : "Quiz");
  const source = clean(typeof o.source === "string" ? o.source : "", 200);
  const stated = o.kind === "flashcards" || o.kind === "quiz" ? o.kind : kind;
  const quiz = { title, ...(source ? { source } : {}), kind: stated, questions };
  const parsed = quizSchema.safeParse(quiz);
  return parsed.success ? parsed.data : null;
}
