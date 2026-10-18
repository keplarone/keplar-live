/**
 * Grading and keyboard. Short answers ignore case and extra whitespace.
 * Keys are the ones on the card: 1–4 or A–D pick, Enter moves on.
 */
import type { QuizQuestion } from "./types";

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function gradeAnswer(given: string, expected: string, type: QuizQuestion["type"]): boolean {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  if (type === "true_false") {
    const yes = /^(?:true|yes|t)$/;
    const no = /^(?:false|no|f)$/;
    if (yes.test(a) && yes.test(b)) return true;
    if (no.test(a) && no.test(b)) return true;
  }
  if (type === "short_answer") {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if ((longer.includes(shorter) || shorter.includes(longer)) && shorter.length >= 3 && longer.length <= shorter.length + 28) return true;
  }
  return false;
}

export type QuizKeyCommand = { type: "pick"; index: number } | { type: "next" };

/** 1–4 or A–D pick an option. Enter is next. Anything else is ignored. */
export function quizKeyCommand(key: string): QuizKeyCommand | null {
  if (key === "Enter") return { type: "next" };
  const letter = key.length === 1 ? key.toLowerCase() : "";
  if (letter >= "a" && letter <= "d") return { type: "pick", index: letter.charCodeAt(0) - 97 };
  if (key >= "1" && key <= "4") return { type: "pick", index: Number(key) - 1 };
  return null;
}
