/** Study mode: shared types (safe for client code). */
export type Topic = { id: string; name: string; pageFrom: number; pageTo: number; outline: string[]; concepts: { term: string; definition: string; page: number }[] };
export type Card = { id: string; topicId: string; front: string; back: string; page: number };
export type McQuestion = { id: string; topicId: string; type: "mc"; q: string; options: string[]; answer: number; explanation: string; page: number };
export type ShortQuestion = { id: string; topicId: string; type: "short"; q: string; answer: string; explanation: string; page: number };
export type Question = McQuestion | ShortQuestion;

export type StudySet = {
  id: string;
  workspaceId: string;
  title: string;
  /** "pdf" or "text" and what was read. */
  source: { kind: "pdf" | "text"; fileName?: string; pages: number; chars: number; truncated: boolean };
  summary: string;
  topics: Topic[];
  cards: Card[];
  questions: Question[];
  /** ISO date (YYYY-MM-DD) of the exam, or null. */
  examDate: string | null;
  /** Share of the guide the build could use, 0..1 (below 1 for guides longer than the plan's budget). */
  coverage: number;
  model?: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
};

/** What the browser gets for a question: never the answer or the explanation. */
export type PublicQuestion = { id: string; topicId: string; type: "mc" | "short"; q: string; options?: string[]; page: number };

export type CardState = { box: number; ease: number; interval: number; reps: number; lapses: number; due: string; last: string };
export type QStat = { seen: number; correct: number; lastCorrect: boolean; lastAt: string };

export type Progress = {
  /** id = set id */
  id: string;
  workspaceId: string;
  cards: Record<string, CardState>;
  questions: Record<string, QStat>;
  diagnosticDone: boolean;
  mock: { at: string; score: number; total: number }[];
  /** Days (YYYY-MM-DD) with any study activity. */
  days: string[];
  updatedAt: string;
};

export type Citation = { page: number; section: string };
export type AskReply = { found: boolean; answer: string; citations: Citation[] };
