/**
 * Take the keplar-quiz fence out of a reply, merge what the models returned,
 * and apply the verifier's keep / drop / fix list.
 */
import { quizSourceName, quizSourceText } from "./ask";
import { parseQuiz } from "./schema";
import { applyQuizVerdicts, reconcileQuizzes } from "./reconcile";
import type { Quiz, QuizAsk, QuizVerdict } from "./types";

const CLOSED = /```[ \t]*keplar-quiz[ \t]*\r?\n([\s\S]*?)```/i;
const OPEN = /```[ \t]*keplar-quiz\b/i;

/** Pull a closed fence out of an answer. An opening fence with no close is dropped from the prose. */
export function takeQuizFence(markdown: string): { prose: string; raw: string | null; pending: boolean } {
  const m = CLOSED.exec(markdown);
  if (m && m.index !== undefined) {
    const prose = `${markdown.slice(0, m.index)}${markdown.slice(m.index + m[0].length)}`.replace(/\n{3,}/g, "\n\n").trim();
    return { prose, raw: m[1]!.trim(), pending: false };
  }
  const open = OPEN.exec(markdown);
  if (open && open.index !== undefined) return { prose: markdown.slice(0, open.index).trim(), raw: null, pending: true };
  return { prose: markdown, raw: null, pending: false };
}

/** While text is still arriving: a half-written fence is not shown. */
export function quizStreamView(source: string): { prose: string; pending: boolean } {
  const taken = takeQuizFence(source);
  if (taken.raw) return { prose: taken.prose, pending: false };
  if (taken.pending) return { prose: taken.prose, pending: true };
  return { prose: source, pending: false };
}

export function quizFromText(text: string, kind: QuizAsk["kind"]): Quiz | null {
  const taken = takeQuizFence(text);
  const raw = taken.raw ?? text;
  return parseQuiz(raw, kind);
}

/** Questions without the key, so copy and share don't reveal the answers. The card holds the key. */
export function quizPlain(quiz: Quiz): string {
  const lines = [`**${quiz.title}**`, ""];
  if (quiz.source) lines.push(`From ${quiz.source}.`, "");
  quiz.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.prompt}`);
    q.options?.forEach((o, n) => lines.push(`${String.fromCharCode(65 + n)}. ${o}`));
    lines.push("");
  });
  lines.push("Answer in the quiz. The key stays hidden until you answer.");
  return lines.join("\n").trim();
}

export function finalizeQuiz(input: {
  texts: string[];
  req: { prompt: string; docs?: { name: string; text: string; source?: string }[]; attachments?: { name: string }[] };
  ask: QuizAsk;
  verdicts?: QuizVerdict[];
}): Quiz | null {
  const quizzes = input.texts.map((t) => quizFromText(t, input.ask.kind)).filter((q): q is Quiz => Boolean(q));
  const merged = reconcileQuizzes(quizzes, {
    source: quizSourceText(input.req),
    count: input.ask.count,
    kind: input.ask.kind,
    sourceName: quizSourceName(input.req),
  });
  if (!merged) return null;
  return applyQuizVerdicts(merged, input.verdicts, quizSourceText(input.req));
}

export function parseQuizVerdicts(text: string): QuizVerdict[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const raw = JSON.parse(m[0]) as { quiz?: unknown };
    if (!Array.isArray(raw.quiz)) return [];
    const out: QuizVerdict[] = [];
    for (const item of raw.quiz.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const o = item as { id?: unknown; verdict?: unknown; answer?: unknown };
      const id = typeof o.id === "string" ? o.id.trim().slice(0, 40) : "";
      const verdict = o.verdict === "keep" || o.verdict === "drop" || o.verdict === "fix" ? o.verdict : null;
      if (!id || !verdict) continue;
      const answer = typeof o.answer === "string" ? o.answer.replace(/\s+/g, " ").trim().slice(0, 400) : undefined;
      out.push({ id, verdict, ...(answer ? { answer } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}
