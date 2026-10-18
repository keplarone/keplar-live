/**
 * Is this message a request for a quiz, a test, flashcards, or practice questions?
 * A question about those things ("how do I write a quiz?") is not a request.
 * Client-safe: the composer and the engine share it.
 */
import type { Quiz, QuizAsk, QuizKind } from "./types";

const QUESTION = /^(?:how|what|why|when|where|which|who|whose|is|are|was|were|should|does|do|did|explain|tell me (?:how|why|what))\b/i;
const POLITE = /^(?:(?:hey|hi|ok|okay|so|now|and|also|then)[,\s]+)*(?:please\s+)?(?:(?:can|could|would|will) you\s+(?:please\s+)?|i (?:want|need|would like|'d like) (?:you )?to\s+|let'?s\s+|help me\s+)?/i;
const MAKE = "(?:make|create|build|generate|write|draft|prepare|put together|design|produce|give me|get me|whip up)";

const clamp = (n: number) => Math.min(20, Math.max(1, Number.isFinite(n) ? Math.round(n) : 10));

/** How many questions they asked for. 10 when they didn't say. */
export function askedCount(text: string): number {
  const patterns = [
    /\b(\d{1,2})\s*-\s*question\b/i,
    /\b(\d{1,2})\s+questions\b/i,
    /\b(\d{1,2})\s*-\s*flash\s?cards?\b/i,
    /\b(\d{1,2})\s+flash\s?cards?\b/i,
    /\b(?:quiz|test)\s+(?:of|with)\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+(?:practice questions|quiz questions)\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return clamp(Number(m[1]));
  }
  return 10;
}

export function quizAsk(text: string): QuizAsk | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (raw.length < 4) return null;
  if (QUESTION.test(raw) && !/\b(?:quiz|test|drill)\s+me\b/i.test(raw)) return null;
  const body = raw.replace(POLITE, "").replace(/^please\s+/i, "");
  const noun = "(?:flash\\s?cards?|quiz(?:zes)?|quiz questions|practice questions)";
  const made = new RegExp(`^${MAKE}\\s+(?:me\\s+)?(?:an?\\s+|some\\s+)?(?:\\d{1,2}\\s*-\\s*question\\s+|\\d{1,2}\\s+)?${noun}\\b`, "i").test(body);
  const direct = /^(?:quiz|test|drill)\s+me\b/i.test(body);
  const about = new RegExp(`^(?:a\\s+)?${noun}\\s+(?:about|on|for|from|covering)\\b`, "i").test(body);
  const testOn = new RegExp(`^${MAKE}\\s+(?:me\\s+)?(?:an?\\s+)?test\\s+(?:on|about|for|from|covering)\\b`, "i").test(body);
  const again = /\b(?:new|another|fresh)\s+(?:quiz|flash\s?cards?)\b/i.test(body) || /^create a (?:new )?(?:\d{1,2}-question )?quiz\b/i.test(body);
  if (!made && !direct && !about && !testOn && !again) return null;
  const flash = /\bflash\s?cards?\b/i.test(body) && !/\bquiz(?:zes)?\b/i.test(body);
  return { kind: flash ? "flashcards" : "quiz", count: askedCount(body) };
}

/** What "New quiz" sends. The wording is itself a quiz request, so the next turn builds another set. */
export function newQuizFollowUp(quiz: Quiz): string {
  const n = Math.min(20, Math.max(1, quiz.questions.length || 10));
  const src = quiz.source ? ` from ${quiz.source}` : "";
  const avoid = quiz.questions
    .map((q) => q.prompt.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(" | ");
  const lead = quiz.kind === "flashcards" ? `Make ${n} new flashcards${src}` : `Create a new ${n}-question quiz${src}`;
  return avoid ? `${lead}. Do not repeat these: ${avoid}` : lead;
}

export function quizSourceName(req: { docs?: { name: string; source?: string }[]; attachments?: { name: string }[] }): string | undefined {
  const files = (req.docs ?? []).filter((d) => !d.source || d.source === "file").map((d) => d.name).filter(Boolean);
  const names = files.length ? files : (req.attachments ?? []).map((a) => a.name).filter(Boolean);
  if (!names.length) return undefined;
  return names.slice(0, 3).join(", ");
}

/** File text the questions must come from. Empty when there is no file: the topic is the conversation, and grounding is the models' job. */
export function quizSourceText(req: { docs?: { name: string; text: string; source?: string }[] }): string {
  const files = (req.docs ?? []).filter((d) => !d.source || d.source === "file");
  const docs = (files.length ? files : []).map((d) => d.text);
  return docs.join("\n").trim();
}

export type { QuizKind };
