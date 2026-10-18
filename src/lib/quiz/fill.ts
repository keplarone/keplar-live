/**
 * A quiz that came back short of the asked count. Valid questions stay.
 * One later call adds the rest from the same source. Fewer than asked is
 * shipped only when that source has no more facts, and the card says so.
 */
import { questionGrounded, similarPrompt } from "./reconcile";
import { questionSchema } from "./schema";
import type { Quiz, QuizQuestion } from "./types";

const NOTE = "This source doesn't cover more questions.";

/** How many distinct facts the source states, when the text is long enough to count. */
export function sourceCapacity(source: string): number | null {
  const text = source.trim();
  if (text.length < 40) return null;
  const parts = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.split(/\s+/).filter((w) => w.length >= 4).length >= 3);
  if (!parts.length) return null;
  return Math.min(20, parts.length);
}

/** A model may say, in one sentence, that the source has no further fact. */
export function cleanLimited(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const line = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (line.length < 8 || line.length > 140) return null;
  return line;
}

/**
 * Attach the one-line note when the quiz is still short and the source cannot
 * support another question. A source that still has unused facts gets no note.
 */
export function applyShortfall(quiz: Quiz, asked: number, source: string, limited: string | null): Quiz {
  const { note: _note, ...rest } = quiz;
  if (rest.questions.length >= asked) return rest;
  const cap = sourceCapacity(source);
  if (cap != null && rest.questions.length < cap) return rest;
  if (cap == null && !cleanLimited(limited)) return rest;
  return { ...rest, note: cleanLimited(limited) || NOTE };
}

/** Add schema-valid questions that are in the source and are not already asked. */
export function addQuizQuestions(base: Quiz, extra: QuizQuestion[], source: string, limit: number): Quiz {
  const kept = [...base.questions];
  const ids = new Set(kept.map((q) => q.id));
  for (const q of extra) {
    if (kept.length >= limit) break;
    if (kept.some((k) => similarPrompt(k.prompt, q.prompt))) continue;
    if (source.trim() && !questionGrounded(q, source)) continue;
    const parsed = questionSchema.safeParse(q);
    if (!parsed.success) continue;
    let id = parsed.data.id || `q${kept.length + 1}`;
    let n = kept.length + 1;
    while (ids.has(id)) {
      const suffix = `-${n++}`;
      id = `${(parsed.data.id || "q").slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    }
    ids.add(id);
    kept.push({ ...parsed.data, id });
  }
  return { ...base, questions: kept };
}
