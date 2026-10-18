/**
 * A quiz (or the same questions shown as flashcards) attached to one chat answer.
 * The markdown stays a readable fallback. The card is the thing the person uses.
 */

export type QuizKind = "quiz" | "flashcards";
export type QuizQuestionType = "multiple_choice" | "true_false" | "short_answer";

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  /** Present for multiple choice and true/false. */
  options?: string[];
  answer: string;
  /** One or two sentences taken from the source, shown after the person answers. */
  explanation: string;
  hint?: string;
};

export type Quiz = {
  title: string;
  /** Attached file name, when the questions came from one. */
  source?: string;
  kind: QuizKind;
  questions: QuizQuestion[];
};

/** Saved on the chat message so a reload keeps the place, the picks, and a "retry missed" subset. */
export type QuizProgress = {
  index: number;
  /** Question id → what they submitted. */
  picks: Record<string, string>;
  /** Flashcards: which cards are showing the back. */
  flipped?: Record<string, boolean>;
  /** When set, only these ids, in this order (retry missed). */
  order?: string[];
  done: boolean;
};

export type QuizVerdict = { id: string; verdict: "keep" | "drop" | "fix"; answer?: string };

export type QuizAsk = { kind: QuizKind; count: number };
