/** Mastery, quiz selection and the study plan (pure). */
import { addDays, daysBetween, isKnown } from "./srs";
import type { Card, Progress, PublicQuestion, Question, QStat, StudySet, Topic } from "./types";

export const emptyProgress = (workspaceId: string, setId: string): Progress => ({ id: setId, workspaceId, cards: {}, questions: {}, diagnosticDone: false, mock: [], days: [], updatedAt: new Date().toISOString() });

export const WEAK_BELOW = 0.6;
export const STRONG_FROM = 0.85;

/** Recent-weighted accuracy for a question (a miss counts more than an old hit). */
function qScore(s: QStat | undefined): number | null {
  if (!s || s.seen === 0) return null;
  const acc = s.correct / s.seen;
  return s.lastCorrect ? Math.max(acc, 0.5 + acc / 2 * 0.6) : Math.min(acc, 0.4);
}

export type TopicMastery = { topicId: string; name: string; mastery: number | null; asked: number; knownCards: number; cards: number; level: "new" | "weak" | "ok" | "strong" };

/** Mastery per topic, 0..1: answered questions (70%) blended with cards you know (30%). Null until there is evidence. */
export function mastery(set: Pick<StudySet, "topics" | "cards" | "questions">, p: Progress): TopicMastery[] {
  return set.topics.map((t) => {
    const qs = set.questions.filter((q) => q.topicId === t.id);
    const scores = qs.map((q) => qScore(p.questions[q.id])).filter((x): x is number => x !== null);
    const cards = set.cards.filter((c) => c.topicId === t.id);
    const reviewed = cards.filter((c) => p.cards[c.id]);
    const known = cards.filter((c) => isKnown(p.cards[c.id])).length;
    const qPart = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const cPart = reviewed.length ? known / cards.length : null;
    const m = qPart !== null && cPart !== null ? qPart * 0.7 + cPart * 0.3 : qPart ?? (cPart !== null ? cPart * 0.8 : null);
    const level = m === null ? "new" : m < WEAK_BELOW ? "weak" : m >= STRONG_FROM ? "strong" : "ok";
    return { topicId: t.id, name: t.name, mastery: m === null ? null : Math.round(m * 100) / 100, asked: scores.length, knownCards: known, cards: cards.length, level };
  });
}

export const overallMastery = (m: TopicMastery[]): number | null => {
  const have = m.filter((x) => x.mastery !== null);
  return have.length ? Math.round((have.reduce((a, x) => a + (x.mastery as number), 0) / m.length) * 100) / 100 : null;
};

/** Deterministic shuffle (seeded), so a quiz is stable per request seed but varies between runs. */
export function shuffled<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type QuizKind = "diagnostic" | "practice" | "adaptive" | "mock";

/** Pick questions: diagnostic = an even spread over topics; practice = least-seen first; adaptive = missed and weak-topic items first; mock = a balanced exam. */
export function pickQuestions(set: Pick<StudySet, "topics" | "questions" | "cards">, p: Progress, kind: QuizKind, n: number, seed: number, topicId?: string): Question[] {
  const pool = set.questions.filter((q) => !topicId || q.topicId === topicId);
  if (!pool.length) return [];
  const take = Math.min(n, pool.length);
  if (kind === "diagnostic" || kind === "mock") {
    const byTopic = new Map<string, Question[]>();
    for (const q of shuffled(pool, seed)) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q]);
    const out: Question[] = [];
    const lists = [...byTopic.values()];
    for (let i = 0; out.length < take && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < take) out.push(l[i]);
    return shuffled(out, seed + 7);
  }
  const m = new Map(mastery(set, p).map((x) => [x.topicId, x.mastery ?? 0.5]));
  const weight = (q: Question) => {
    const st = p.questions[q.id];
    const missed = st && !st.lastCorrect ? 3 : 0;
    const unseen = !st ? 1.2 : 0;
    const weak = kind === "adaptive" ? (1 - (m.get(q.topicId) ?? 0.5)) * 2.5 : 0;
    const recent = st && st.lastCorrect ? -0.8 : 0;
    return missed + unseen + weak + recent;
  };
  const order = shuffled(pool, seed).map((q, i) => ({ q, w: weight(q) + (i % 7) * 0.01 })).sort((a, b) => b.w - a.w);
  return shuffled(order.slice(0, take).map((x) => x.q), seed + 3);
}

/** The question without its answer or explanation. */
export function publicQuestion(q: Question): PublicQuestion {
  return { id: q.id, topicId: q.topicId, type: q.type, q: q.q, ...(q.type === "mc" ? { options: q.options } : {}), page: q.page };
}

export type PlanDay = { date: string; label: string; tasks: { kind: "learn" | "cards" | "quiz" | "review" | "mock" | "rest"; text: string; topicId?: string }[] };

/**
 * A day-by-day plan from today to the exam: weak and new topics first, cards every day, a quiz after each topic,
 * a review day before the final mock exam, and the mock the day before the exam. Pure and deterministic.
 */
export function studyPlan(set: Pick<StudySet, "topics" | "cards">, m: TopicMastery[], examDate: string, today: string): PlanDay[] {
  const left = daysBetween(today, examDate);
  if (!(left >= 0)) return [];
  const days = Math.min(left + 1, 60);
  const order = [...set.topics].sort((a, b) => (m.find((x) => x.topicId === a.id)?.mastery ?? -1) - (m.find((x) => x.topicId === b.id)?.mastery ?? -1));
  const plan: PlanDay[] = [];
  const mockDay = days >= 3 ? days - 2 : -1;
  const reviewDay = days >= 4 ? days - 3 : -1;
  const learnDays = Math.max(1, (mockDay >= 0 ? mockDay : days) - (reviewDay >= 0 ? 1 : 0));
  const perDay = Math.max(1, Math.ceil(order.length / learnDays));
  let ti = 0;
  for (let d = 0; d < days; d++) {
    const date = addDays(today, d);
    const label = d === 0 ? "Today" : d === days - 1 && left + 1 === days ? "Exam day" : new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const tasks: PlanDay["tasks"] = [];
    if (d === days - 1 && left + 1 === days && days > 1) tasks.push({ kind: "rest", text: "Light review of flashcards, then rest. You've prepared." });
    else if (d === mockDay) tasks.push({ kind: "mock", text: "Take the mock exam under test conditions." }, { kind: "cards", text: "Review today's due flashcards." });
    else if (d === reviewDay) tasks.push({ kind: "review", text: "Review your weakest topics and every missed question." }, { kind: "cards", text: "Review today's due flashcards." });
    else {
      for (const t of order.slice(ti, ti + perDay)) tasks.push({ kind: "learn", text: `Study: ${t.name}`, topicId: t.id }, { kind: "quiz", text: `Practice quiz: ${t.name}`, topicId: t.id });
      ti += perDay;
      if (!tasks.length) tasks.push({ kind: "review", text: "Adaptive practice on whatever is still weak." });
      tasks.push({ kind: "cards", text: "Review today's due flashcards." });
    }
    plan.push({ date, label, tasks });
  }
  return plan;
}

export const topicOf = (set: Pick<StudySet, "topics">, id: string): Topic | undefined => set.topics.find((t) => t.id === id);
export type { Card };
