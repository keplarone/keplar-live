/**
 * Turn a markdown quiz (numbered questions, A–D options, an answer key) into
 * the quiz schema. No model call. Null when the text is not a complete quiz.
 */
import { questionSchema, quizSchema } from "./schema";
import type { Quiz, QuizKind, QuizQuestion } from "./types";

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function plain(s: string): string {
  return s.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "").trim();
}

const QUESTION = /^(?:question\s+)?(\d{1,2})[.)]\s+(.+)$/i;
const OPTION = /^(?:[-*]\s*)?\(?([A-Da-d])\)?[.)]\s+(.+)$/;
const KEY_HEAD = /^(?:#{1,3}\s*)?(?:answer\s*key|answers|correct\s+answers|key)\b[:.]?\s*(.*)$/i;
const INLINE_ANSWER = /^(?:answer|correct(?:\s+answer)?)\s*[:：]\s*([A-Da-d])\b(?:\s*[.)\-–—:]\s*(.+))?$/i;

type KeyHit = { letter: string; why?: string };

/** "1. A" or "1. A — why", not a question that happens to start with "A person". */
function isKeyLine(line: string): boolean {
  return /^\d{1,2}\s*[.)]\s*[A-Da-d](?:\s*[.)]|\s*[-–—:]|\s*$)/.test(line.trim()) && !/^\d{1,2}\s*[.)]\s*[A-Da-d]\s+[a-z]{3,}/.test(line.trim());
}

function trailingKey(lines: string[]): number {
  let i = lines.length - 1;
  while (i >= 0 && !lines[i]!.trim()) i--;
  const end = i;
  while (i >= 0 && (!lines[i]!.trim() || isKeyLine(lines[i]!))) i--;
  const block = lines.slice(i + 1, end + 1);
  const n = block.reduce((s, l) => s + (isKeyLine(l) ? keyHits(l).length : 0), 0);
  return n >= 1 ? i + 1 : -1;
}

function keyHits(line: string): { n: number; hit: KeyHit }[] {
  const out: { n: number; hit: KeyHit }[] = [];
  const re = /(\d{1,2})\s*[.)]\s*([A-Da-d])\b(?:\s*[.)\-–—:]\s*([^0-9].*?))?(?=\s+\d{1,2}\s*[.)]\s*[A-Da-d]\b|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const why = clean(m[3] ?? "", 500);
    out.push({ n: Number(m[1]), hit: { letter: m[2]!.toUpperCase(), ...(why.length >= 8 ? { why } : {}) } });
  }
  return out;
}

function splitOptions(rest: string): { prompt: string; options: { letter: string; text: string }[] } | null {
  const marks = [...rest.matchAll(/(?:^|\s)\(?([A-Da-d])\)?[.)]\s+/g)];
  if (marks.length < 2) return null;
  const prompt = clean(rest.slice(0, marks[0]!.index).replace(/[?:]\s*$/, ""), 600);
  const options = marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1]!.index ?? rest.length) : rest.length;
    return { letter: m[1]!.toUpperCase(), text: clean(rest.slice(start, end), 240) };
  }).filter((o) => o.text);
  if (!prompt || options.length < 2) return null;
  return { prompt, options };
}

function explanationFor(option: string, why?: string): string {
  if (why && why.length >= 8) return clean(why, 500);
  if (option.length >= 8) return clean(option, 500);
  return "The answer key gives this option.";
}

/**
 * Parse one markdown quiz. Questions without a letter in the key are dropped.
 * Null when nothing valid remains.
 */
export function parseMarkdownQuiz(text: string, kind: QuizKind = "quiz"): Quiz | null {
  if (kind === "flashcards") return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => plain(l));
  let keyAt = lines.findIndex((l) => KEY_HEAD.test(l));
  if (keyAt < 0) keyAt = trailingKey(lines);
  const key = new Map<number, KeyHit>();
  const keyLines = keyAt >= 0 ? lines.slice(keyAt) : [];
  for (const line of keyLines) {
    const head = KEY_HEAD.exec(line);
    if (head?.[1]) for (const hit of keyHits(head[1])) key.set(hit.n, hit.hit);
    for (const hit of keyHits(line)) key.set(hit.n, hit.hit);
  }

  const body = keyAt >= 0 ? lines.slice(0, keyAt) : lines;
  type Draft = { n: number; prompt: string; options: { letter: string; text: string }[]; letter?: string; why?: string };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  const flush = () => { if (cur && cur.prompt && cur.options.length >= 2) drafts.push(cur); };

  for (const line of body) {
    if (!line) continue;
    const inline = INLINE_ANSWER.exec(line);
    if (inline && cur) {
      cur.letter = inline[1]!.toUpperCase();
      const why = clean(inline[2] ?? "", 500);
      if (why.length >= 8) cur.why = why;
      continue;
    }
    const q = QUESTION.exec(line);
    if (q) {
      flush();
      const split = splitOptions(q[2]!);
      cur = split
        ? { n: Number(q[1]), prompt: split.prompt, options: split.options }
        : { n: Number(q[1]), prompt: clean(q[2]!, 600), options: [] };
      continue;
    }
    const opt = OPTION.exec(line);
    if (opt && cur) {
      const text = clean(opt[2]!, 240);
      if (text) cur.options.push({ letter: opt[1]!.toUpperCase(), text });
      continue;
    }
    if (cur && cur.options.length === 0) cur.prompt = clean(`${cur.prompt} ${line}`, 600);
    else if (cur && cur.options.length) {
      const last = cur.options[cur.options.length - 1]!;
      last.text = clean(`${last.text} ${line}`, 240);
    }
  }
  flush();

  const questions: QuizQuestion[] = [];
  for (const d of drafts.slice(0, 20)) {
    const hit = key.get(d.n);
    const letter = (hit?.letter ?? d.letter ?? "").toUpperCase();
    const chosen = d.options.find((o) => o.letter === letter);
    if (!chosen) continue;
    const options = d.options.map((o) => o.text).filter(Boolean).slice(0, 6);
    if (options.length < 2 || !options.includes(chosen.text)) continue;
    const tf = options.length === 2 && options.every((o) => /^(?:true|false)$/i.test(o));
    const q: QuizQuestion = {
      id: `q${questions.length + 1}`,
      type: tf ? "true_false" : "multiple_choice",
      prompt: d.prompt,
      options,
      answer: chosen.text,
      explanation: explanationFor(chosen.text, hit?.why ?? d.why),
    };
    if (questionSchema.safeParse(q).success) questions.push(q);
  }
  if (!questions.length) return null;
  const titleLine = lines.find((l) => l && !QUESTION.test(l) && !OPTION.test(l) && !KEY_HEAD.test(l) && !INLINE_ANSWER.test(l));
  const title = clean(titleLine && titleLine.length <= 140 ? titleLine.replace(/^#+\s*/, "") : "", 140) || "Quiz";
  const quiz = { title, kind, questions };
  const parsed = quizSchema.safeParse(quiz);
  return parsed.success ? parsed.data : null;
}
