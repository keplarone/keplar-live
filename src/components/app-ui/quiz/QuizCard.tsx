"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/kit";
import { IconCheck, IconClose } from "../icons";
import { gradeAnswer, quizKeyCommand } from "@/lib/quiz/grade";
import { newQuizFollowUp } from "@/lib/quiz/ask";
import type { Quiz, QuizProgress, QuizQuestion } from "@/lib/quiz/types";
import s from "./QuizCard.module.css";

const empty = (): QuizProgress => ({ index: 0, picks: {}, done: false });

/** Letter of a multiple-choice answer, or the expected phrase for a short answer. */
function answerLead(q: QuizQuestion): string {
  if (q.options?.length) {
    const i = q.options.indexOf(q.answer);
    if (i >= 0) return String.fromCharCode(65 + i);
  }
  return q.answer;
}

/** Correct keeps the source sentence. A miss names the key, then the same sentence. */
function feedbackBody(q: QuizQuestion, correct: boolean): string {
  const why = q.explanation.replace(/\s+/g, " ").trim();
  if (correct) return why;
  return `The answer is ${answerLead(q)}. ${why}`;
}

function questionsOf(quiz: Quiz, progress: QuizProgress): QuizQuestion[] {
  const ids = progress.order ?? quiz.questions.map((q) => q.id);
  return ids.map((id) => quiz.questions.find((q) => q.id === id)).filter((q): q is QuizQuestion => Boolean(q));
}

export function QuizBuilding({ kind, source }: { kind?: "quiz" | "flashcards"; source?: string }) {
  const what = kind === "flashcards" ? "flashcards" : "quiz";
  const label = source ? `Building your ${what} from ${source}…` : `Building your ${what}…`;
  return (
    <div className={s.building} role="status" aria-live="polite" data-quiz-building="">
      <p>{label}</p>
      <span className="m-skeleton" data-shape="title" />
      <span className="m-skeleton" data-shape="line" />
      <span className="m-skeleton" data-shape="line" />
      <span className="m-skeleton" data-shape="block" />
    </div>
  );
}

export function QuizCard({
  quiz,
  progress: saved,
  onProgress,
  onNew,
}: {
  quiz: Quiz;
  progress?: QuizProgress;
  onProgress?: (next: QuizProgress) => void;
  onNew?: (text: string) => void;
}) {
  const progress = saved ?? empty();
  const questions = questionsOf(quiz, progress);
  if (!questions.length) return null;
  if (quiz.kind === "flashcards") {
    return <Flashcards quiz={quiz} questions={questions} progress={progress} onProgress={onProgress} onNew={onNew} />;
  }
  return <QuizRun quiz={quiz} questions={questions} progress={progress} onProgress={onProgress} onNew={onNew} />;
}

function useMoveFocus<T extends HTMLElement>(key: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const skip = useRef(true);
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    ref.current?.focus();
  }, [key]);
  return ref;
}

function QuizRun({
  quiz,
  questions,
  progress,
  onProgress,
  onNew,
}: {
  quiz: Quiz;
  questions: QuizQuestion[];
  progress: QuizProgress;
  onProgress?: (next: QuizProgress) => void;
  onNew?: (text: string) => void;
}) {
  const uid = useId();
  const index = Math.min(progress.index, questions.length - 1);
  const q = questions[index]!;
  const pick = progress.picks[q.id];
  const graded = pick !== undefined;
  const correct = graded && gradeAnswer(pick, q.answer, q.type);
  const head = useMoveFocus<HTMLHeadingElement>(`${progress.done ? "done" : index}`);
  const [seen, setSeen] = useState(q.id);
  const [draft, setDraft] = useState("");
  const [hintOn, setHintOn] = useState(false);
  if (seen !== q.id) {
    setSeen(q.id);
    setDraft("");
    setHintOn(false);
  }
  const set = (next: QuizProgress) => onProgress?.(next);

  const choose = (value: string) => {
    if (graded) return;
    set({ ...progress, picks: { ...progress.picks, [q.id]: value } });
  };

  const go = (dir: number) => {
    const next = index + dir;
    if (next >= questions.length) set({ ...progress, done: true, index });
    else if (next >= 0) set({ ...progress, index: next, done: false });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const cmd = quizKeyCommand(e.key);
    if (!cmd) return;
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (tag === "BUTTON" && el.getAttribute("role") !== "radio" && cmd.type === "next") return;
    if (progress.done) {
      if (cmd.type === "next") return;
      return;
    }
    if (cmd.type === "pick") {
      if (typing || graded || !q.options || cmd.index >= q.options.length) return;
      e.preventDefault();
      choose(q.options[cmd.index]!);
      return;
    }
    if (q.type === "short_answer" && !graded) {
      if (!typing) return;
      e.preventDefault();
      const value = draft.trim();
      if (value) choose(value);
      return;
    }
    if (!graded) return;
    e.preventDefault();
    go(1);
  };

  if (progress.done) {
    return <Score quiz={quiz} questions={questions} progress={progress} onProgress={onProgress} onNew={onNew} head={head} />;
  }

  const n = questions.length;
  return (
    <section className={s.card} data-quiz="" data-quiz-question="" aria-labelledby={`${uid}-q`} onKeyDown={onKeyDown}>
      <div className={s.progress}>
        <div className={s.meta}>
          <p className={s.count}>{index + 1} of {n}</p>
          {quiz.source ? <p className={s.source}>{quiz.source}</p> : null}
        </div>
        <div className={s.track} role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1} aria-label={`Question ${index + 1} of ${n}`}>
          <span style={{ width: `${((index + 1) / n) * 100}%` }} />
        </div>
      </div>
      <h3 id={`${uid}-q`} ref={head} className={s.prompt} tabIndex={-1}>{q.prompt}</h3>
      {q.options ? (
        <div role="radiogroup" aria-labelledby={`${uid}-q`} className={s.options}>
          {q.options.map((opt, i) => {
            const chosen = pick === opt;
            const state = !graded ? undefined : opt === q.answer ? "correct" : chosen ? "wrong" : undefined;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                className={s.opt}
                aria-checked={chosen}
                aria-disabled={graded || undefined}
                data-state={state}
                onClick={() => choose(opt)}
              >
                <span className={s.letter}>{String.fromCharCode(65 + i)}</span>
                <span>{opt}</span>
                {state === "correct" ? <span className={s.mark}><IconCheck size={16} /> <span className="visually-hidden">Correct</span></span> : null}
                {state === "wrong" ? <span className={s.mark}><IconClose size={16} /> <span className="visually-hidden">Not quite</span></span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className={s.short}
          onSubmit={(e) => {
            e.preventDefault();
            if (!graded && draft.trim()) choose(draft.trim());
          }}
        >
          <input className={s.field} value={graded ? pick : draft} disabled={graded} aria-label="Your answer" onChange={(e) => setDraft(e.target.value)} />
          {graded ? null : <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>Check</Button>}
        </form>
      )}
      <div aria-live="polite">
        {graded ? (
          <div className={s.feedback} data-state={correct ? "correct" : "wrong"} role="status">
            <p className={s.verdict}>{correct ? "Correct" : "Not quite"}</p>
            <p className={s.explain}>{feedbackBody(q, correct)}</p>
          </div>
        ) : null}
      </div>
      {q.hint && !graded ? (
        hintOn ? <p className={s.hint}>{q.hint}</p> : <button type="button" className={s.opt} onClick={() => setHintOn(true)}>Hint</button>
      ) : null}
      <div className={s.row}>
        <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => go(-1)}>Previous</Button>
        <Button variant="primary" size="sm" disabled={!graded} onClick={() => go(1)}>{index === n - 1 ? "See score" : "Next"}</Button>
      </div>
    </section>
  );
}

function Score({
  quiz,
  questions,
  progress,
  onProgress,
  onNew,
  head,
}: {
  quiz: Quiz;
  questions: QuizQuestion[];
  progress: QuizProgress;
  onProgress?: (next: QuizProgress) => void;
  onNew?: (text: string) => void;
  head: RefObject<HTMLHeadingElement | null>;
}) {
  const scoreId = useId();
  const right = questions.filter((q) => gradeAnswer(progress.picks[q.id] ?? "", q.answer, q.type));
  const missed = questions.filter((q) => !right.includes(q));
  return (
    <section className={s.card} data-quiz="" data-quiz-score="" aria-labelledby={scoreId}>
      <h3 id={scoreId} ref={head} className={s.score} tabIndex={-1}>
        You got {right.length} of {questions.length}
      </h3>
      {missed.length ? (
        <ul className={s.missed} aria-label="Missed questions">
          {missed.map((q) => (
            <li key={q.id}>
              <p className={s.kicker}>Missed</p>
              <p>{q.prompt}</p>
              <p>Your answer: {progress.picks[q.id] || "—"}</p>
              <p>{feedbackBody(q, false)}</p>
            </li>
          ))}
        </ul>
      ) : <p>Every question.</p>}
      <div className={s.row}>
        <Button
          variant="secondary"
          size="sm"
          disabled={!missed.length}
          onClick={() => {
            const drop = new Set(missed.map((q) => q.id));
            const picks = { ...progress.picks };
            for (const id of drop) delete picks[id];
            onProgress?.({ index: 0, picks, order: missed.map((q) => q.id), done: false });
          }}
        >
          Retry missed
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onProgress?.({ index: 0, picks: {}, done: false })}>Retake</Button>
        <Button variant="primary" size="sm" onClick={() => onNew?.(newQuizFollowUp(quiz))}>New quiz</Button>
      </div>
    </section>
  );
}

function Flashcards({
  quiz,
  questions,
  progress,
  onProgress,
  onNew,
}: {
  quiz: Quiz;
  questions: QuizQuestion[];
  progress: QuizProgress;
  onProgress?: (next: QuizProgress) => void;
  onNew?: (text: string) => void;
}) {
  const uid = useId();
  const index = Math.min(progress.index, questions.length - 1);
  const q = questions[index]!;
  const flipped = Boolean(progress.flipped?.[q.id]);
  const head = useMoveFocus<HTMLParagraphElement>(String(index) + (flipped ? "b" : "a"));
  const n = questions.length;
  const setFlip = (on: boolean) => onProgress?.({ ...progress, flipped: { ...progress.flipped, [q.id]: on } });
  const go = (dir: number) => {
    const next = Math.min(n - 1, Math.max(0, index + dir));
    onProgress?.({ ...progress, index: next });
  };
  return (
    <section
      className={s.card}
      data-quiz=""
      data-flashcards=""
      onKeyDown={(e) => {
        const cmd = quizKeyCommand(e.key);
        if (!cmd || cmd.type === "pick") return;
        e.preventDefault();
        if (!flipped) setFlip(true);
        else go(1);
      }}
    >
      <div className={s.progress}>
        <div className={s.meta}>
          <p className={s.count}>{index + 1} of {n}</p>
          {quiz.source ? <p className={s.source}>{quiz.source}</p> : null}
        </div>
        <div className={s.track} role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1} aria-label={`Card ${index + 1} of ${n}`}>
          <span style={{ width: `${((index + 1) / n) * 100}%` }} />
        </div>
      </div>
      <button
        type="button"
        className={s.face}
        data-side={flipped ? "back" : "front"}
        aria-pressed={flipped}
        onClick={() => setFlip(!flipped)}
      >
        <p className={s.side}>{flipped ? "Answer" : "Term"}</p>
        <p id={`${uid}-card`} ref={head} className={s.term} tabIndex={-1}>{flipped ? q.answer : q.prompt}</p>
        {flipped ? <p>{q.explanation}</p> : <p className={s.side}>Press to flip</p>}
      </button>
      <div className={s.row}>
        <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => go(-1)}>Previous</Button>
        <Button variant="primary" size="sm" disabled={index === n - 1} onClick={() => go(1)}>Next</Button>
        <Button variant="secondary" size="sm" onClick={() => onNew?.(newQuizFollowUp(quiz))}>New set</Button>
      </div>
    </section>
  );
}
