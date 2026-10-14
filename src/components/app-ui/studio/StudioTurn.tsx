"use client";
/**
 * Study and Slides in the chat (composer chips). The card does the work through the same APIs the studios use, shows the result where
 * the person asked, and opens it in the Study / Slides tab for the full tools. Nothing here is a stand-in: the counts, steps, cards,
 * slides and themes come from the saved study set or deck, and every failure is the server's own message.
 *   Study:  after the answer finishes, POST /api/study/sets with the answer (or the attached documents) as the guide.
 *   Slides: at once, POST /api/slides/decks with the message as the brief (slides/from-chat.ts).
 * Everything the tabs do also works here: Study flips every flashcard (graded into the same spaced-repetition schedule), runs the
 * A-D quiz (graded on the server) and shows mastery; Slides rewrites one slide from a follow-up ("make slide 3 shorter"), edits a
 * slide's text and notes by hand, moves and deletes slides (delete after a confirm click), switches
 * the theme, presents fullscreen and exports PPTX / PDF. A follow-up is its own card on the same deck or set (op / standalone).
 */
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { KeplarSymbol } from "@/components/brand";
import { SlideView } from "@/components/slides/SlideView";
import { Present } from "@/components/slides/Present";
import { canUseSlides, slidesLimitsFor } from "@/lib/tools/limits";
import { deckRequestFrom } from "@/lib/slides/from-chat";
import { FIELD_MAX, THEMES, type Deck, type DeckTheme, type Slide } from "@/lib/slides/types";
import { bulletsToText, moveSlide, removeSlide, withSlideText, type SlideText } from "@/lib/slides/deck-edit";
import { MIN_GUIDE_CHARS, studyGuideFrom } from "@/lib/study/from-chat";
import type { Card, PublicQuestion, StudySet } from "@/lib/study/types";
import type { PlanDay } from "@/lib/study/progress";
import { localDay } from "@/lib/study/exam-date";
import type { Intent } from "@/lib/chat-actions/intent";
import { docsFor } from "../doc-client";
import type { KeplarMessage, Ledger, StudioTurn as Studio, UserMessage } from "../state/types";
import { Confirm } from "../workspace/Confirm";
import sl from "@/components/slides/slides.module.css";
import s from "./studio.module.css";
import { Button, SegmentedControl } from "@/components/kit";

export type StudioOpen = { kind: "study"; id: string; tab?: "overview" | "cards" | "quiz" } | { kind: "slides"; id: string; slide?: number };

type Props = {
  message: KeplarMessage;
  user?: UserMessage;
  ledger: Ledger;
  onPatch: (patch: Partial<Studio>) => void;
  onOpen: (target: StudioOpen) => void;
  /** After something was charged: refresh the usage meter. */
  onSettled: () => void;
  /** Study built from an earlier answer ("quiz me on this"): that answer's text. */
  sourceAnswer?: string;
  /** A follow-up asked from inside the card (e.g. "rewrite this slide"): posted as a new message that acts on this deck. */
  onAct?: (text: string, intent: Intent) => void;
};

type ApiErr = Error & { status?: number };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong. Nothing was charged for a run that didn't finish."), { status: res.status }) as ApiErr;
  return data;
}

/** Cards started in this tab (StrictMode runs effects twice; a re-render must never start a second build or deck). */
const started = new Set<string>();

export function StudioTurn(props: Props) {
  return props.message.studio?.kind === "slides" ? <SlidesCard {...props} /> : <StudyCard {...props} />;
}

function Head({ busy, label, chip }: { busy: boolean; label: string; chip?: string }) {
  return (
    <header className={s.head}>
      <KeplarSymbol size={16} className={s.sym} />
      <span className={s.label} data-busy={busy || undefined}>{label}</span>
      {chip ? <span className={s.chip}>{chip}</span> : null}
    </header>
  );
}

/* ───────────── Study ───────────── */

type Mastery = { topicId: string; name: string; mastery: number | null; level: "new" | "weak" | "ok" | "strong" };
type StudyDetail = {
  set: Omit<StudySet, "questions"> & { questionCount: number };
  progress?: { overall: number | null; mastery: Mastery[]; dueCards: number; diagnosticDone?: boolean };
  /** Day-by-day plan to the exam (only when the set has an exam date). */
  plan?: PlanDay[];
};
type StudyTab = "overview" | "cards" | "quiz" | "plan";
type QuizKind = "practice" | "diagnostic";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100));

function StudyCard({ message: m, user, ledger, onPatch, onOpen, onSettled, sourceAnswer }: Props) {
  const st = m.studio!;
  const [detail, setDetail] = useState<StudyDetail | null>(null);
  const [gone, setGone] = useState(false);
  const [tab, setTab] = useState<StudyTab>(st.focus === "placement" ? "quiz" : st.focus ?? "overview");
  const [quizKind, setQuizKind] = useState<QuizKind>(st.focus === "placement" ? "diagnostic" : "practice");
  const [tick, setTick] = useState(0);
  const [examBusy, setExamBusy] = useState(false);
  const [examErr, setExamErr] = useState("");
  const patch = useRef(onPatch);
  const settled = useRef(onSettled);
  useEffect(() => { patch.current = onPatch; settled.current = onSettled; });

  // A standalone card studies an earlier answer ("quiz me on this"); otherwise the answer right above it.
  const answer = st.from ? sourceAnswer ?? "" : m.answer?.markdown ?? "";
  const finished = st.from ? true : m.status !== "running";
  const answerOk = st.from ? Boolean(answer) : m.status === "done" && Boolean(answer);
  useEffect(() => {
    if (st.phase !== "waiting" || !finished || !ledger.synced) return;
    if (!answerOk) { patch.current({ phase: "skipped", error: st.from ? "That answer isn't in this chat any more, so there is nothing to study. Ask again with Study on." : "The answer didn't finish, so no study set was built. Ask again with Study on." }); return; }
    if (!ledger.signedIn) { patch.current({ phase: "signin" }); return; }
    if (started.has(m.id)) return;
    started.add(m.id);
    const guide = studyGuideFrom(user?.text ?? "", answer, docsFor(user?.attachments));
    if (guide.text.trim().length < MIN_GUIDE_CHARS) { patch.current({ phase: "failed", error: "This answer is too short to study from. Ask for a fuller explanation, or attach your notes." }); return; }
    patch.current({ phase: "working", source: guide.source });
    const fd = new FormData();
    fd.append("text", guide.text);
    api<{ id: string; credits: number }>("/api/study/sets", { method: "POST", body: fd })
      .then((r) => patch.current({ phase: "ready", id: r.id, credits: r.credits }))
      .catch((e: Error) => patch.current({ phase: "failed", error: e.message }))
      .finally(() => settled.current());
  }, [st.phase, st.from, finished, answerOk, m.id, answer, ledger.synced, ledger.signedIn, user]);

  // The set and your progress (mastery) come from the server; reloaded after each flashcard round or quiz.
  useEffect(() => {
    if (st.phase !== "ready" || !st.id) return;
    let on = true;
    api<StudyDetail>(`/api/study/sets/${st.id}`).then((d) => on && setDetail(d)).catch((e: ApiErr) => on && e.status === 404 && setGone(true));
    return () => { on = false; };
  }, [st.phase, st.id, tick]);

  /** Saves (or clears) the exam date with the Study tab's PATCH; the server then returns the day-by-day plan. */
  const saveExam = async (date: string) => {
    if (!st.id) return false;
    setExamBusy(true);
    setExamErr("");
    try {
      await api(`/api/study/sets/${st.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ examDate: date || null }) });
      setTick((n) => n + 1);
      return true;
    } catch (e) { setExamErr((e as Error).message); return false; } finally { setExamBusy(false); }
  };
  const saveExamRef = useRef(saveExam);
  useEffect(() => { saveExamRef.current = saveExam; });

  // "my exam is on Nov 3": saved once, when the card first opens (a reload shows the saved plan, it doesn't save again).
  useEffect(() => {
    if (st.phase !== "ready" || !st.id || st.examDate === undefined || st.opDone || started.has(`${m.id}:exam`)) return;
    started.add(`${m.id}:exam`);
    void saveExamRef.current(st.examDate).then((ok) => ok && patch.current({ opDone: "done" }));
  }, [st.phase, st.id, st.examDate, st.opDone, m.id]);

  if (st.phase === "waiting" && !finished) return null; // the answer above is still being written
  if (st.phase === "skipped") return <section className={s.card} data-studio="study" data-phase="skipped"><Head busy={false} label="Study" /><p className={s.note}>{st.error}</p></section>;
  if (st.phase === "signin") {
    return (
      <section className={s.card} data-studio="study" data-phase="signin">
        <Head busy={false} label="Study" />
        <p className={s.note}>Sign in to turn this answer into flashcards and a quiz. Study sets and your progress are saved to your account; Study mode is on every plan, including Free.</p>
        <div className={s.actions}><Link href="/signin?next=/app" className={sl.primary}>Sign in</Link><Link href="/signup?next=/app" className={sl.ghost}>Create a free account</Link></div>
      </section>
    );
  }
  if (st.phase === "failed" || st.phase === "interrupted") {
    return (
      <section className={s.card} data-studio="study" data-phase={st.phase}>
        <Head busy={false} label="Study set not built" />
        <p className={s.note} role={st.phase === "failed" ? "alert" : undefined}>{st.phase === "interrupted" ? "The page reloaded while the study set was being built. If it finished, it is in the Study tab." : st.error}</p>
        {st.phase === "interrupted" ? <div className={s.actions}><Button variant="secondary" size="sm" onClick={() => onOpen({ kind: "study", id: "" })}>Open in Study</Button></div> : null}
      </section>
    );
  }
  if (st.phase !== "ready" || !detail) {
    return (
      <section className={s.card} data-studio="study" data-phase="working" aria-busy="true">
        <Head busy={!gone} label={st.phase === "ready" && gone ? "This study set was deleted" : st.phase === "ready" ? "Opening your study set…" : "Building your study set…"} />
        {st.phase === "ready" && gone ? null : <div className={s.skeleton} aria-hidden="true"><i /><i /><i /></div>}
      </section>
    );
  }
  const set = detail.set;
  const steps = set.topics.slice(0, 4);
  const overall = pct(detail.progress?.overall);
  const chip = `${set.topics.length} ${set.topics.length === 1 ? "topic" : "topics"} · ${set.cards.length} flashcards · ${set.questionCount} quiz questions`;
  return (
    <section className={s.card} data-studio="study" data-phase="ready" data-tab={tab} aria-label={`Study set: ${set.title}`}>
      <Head busy={false} label={!st.standalone ? "Study set ready" : st.focus === "quiz" ? "Quiz" : st.focus === "cards" ? "Flashcards" : st.focus === "plan" ? (st.examDate && st.opDone ? "Exam date saved" : st.examDate === "" && st.opDone ? "Exam date cleared" : "Study plan") : st.focus === "placement" ? "Placement quiz" : "Study set ready"} chip={chip} />
      <div className={s.deckHead}>
        <div className={s.deckTitle}>
          <h3 className={s.title}>{set.title}</h3>
          <span className={s.mastery} data-mastery={overall ?? "new"} title="Mastery: your quiz answers (70%) and the flashcards you know (30%)">
            <span className={s.masteryBar} aria-hidden="true"><i style={{ width: `${overall ?? 0}%` }} /></span>
            {overall === null ? "Mastery: take the quiz to start" : `Mastery ${overall}%`}
          </span>
        </div>
        <SegmentedControl label="Study" size="sm" value={tab} onValueChange={setTab} options={(["overview", "cards", "quiz", "plan"] as const).map((t) => ({ value: t, label: t === "overview" ? "Overview" : t === "cards" ? "Flashcards" : t === "quiz" ? "Quiz" : "Plan" }))} />
      </div>
      {tab === "overview" ? (
        <>
          <div className={s.panel}>
            <p className={s.sub}>Plain-English summary · {set.topics.length} {set.topics.length === 1 ? "step" : "steps"}{st.source === "documents" ? " · from your documents" : " · from this answer"}</p>
            <ol className={s.steps}>
              {steps.map((t, i) => (
                <li key={t.id} className={s.step}>
                  <span className={s.n} aria-hidden="true">{i + 1}</span>
                  <p><strong>{t.name}.</strong> {t.outline[0] ?? ""}</p>
                </li>
              ))}
            </ol>
          </div>
          {detail.progress?.mastery.length ? (
            <ul className={s.topics} aria-label="Mastery by topic">
              {detail.progress.mastery.map((t) => (
                <li key={t.topicId} className={s.topic} data-level={t.level}>
                  <span className={s.topicName}>{t.name}</span>
                  <span className={s.masteryBar} aria-hidden="true"><i style={{ width: `${pct(t.mastery) ?? 0}%` }} /></span>
                  <span className={s.meta}>{t.mastery === null ? "new" : `${pct(t.mastery)}%`}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {detail.progress && !detail.progress.diagnosticDone ? <p className={s.note}>New here? Start with the placement quiz: a short quiz across every topic that finds your weak spots and sets your starting mastery.</p> : null}
          <div className={s.actions}>
            {detail.progress && !detail.progress.diagnosticDone ? <Button variant="primary" size="sm" data-placement="" onClick={() => { setQuizKind("diagnostic"); setTab("quiz"); }}>Take the placement quiz</Button> : null}
            <Button variant={detail.progress && !detail.progress.diagnosticDone ? "secondary" : "primary"} size="sm" onClick={() => setTab("cards")}>Practice flashcards</Button>
            <Button variant="secondary" size="sm" onClick={() => { setQuizKind("practice"); setTab("quiz"); }}>Take the quiz</Button>
            <Button variant="secondary" size="sm" onClick={() => setTab("plan")}>{set.examDate ? `Exam ${set.examDate}` : "Set exam date"}</Button>
            <Button variant="secondary" size="sm" onClick={() => onOpen({ kind: "study", id: set.id })}>Open in Study</Button>
            {st.credits ? <span className={s.meta}>Charged {st.credits} credits</span> : null}
          </div>
        </>
      ) : tab === "cards" ? (
        <CardDeck setId={set.id} onDone={() => setTick((n) => n + 1)} onOpen={() => onOpen({ kind: "study", id: set.id, tab: "cards" })} />
      ) : tab === "plan" ? (
        <PlanPanel key={set.examDate ?? ""} examDate={set.examDate ?? ""} plan={detail.plan ?? []} busy={examBusy} err={examErr} onSave={(d) => void saveExam(d)} onGo={setTab} onOpen={() => onOpen({ kind: "study", id: set.id })} />
      ) : (
        <>
          {quizKind === "practice" && detail.progress && !detail.progress.diagnosticDone ? (
            <div className={s.actions}><button type="button" className={sl.linkBtn} onClick={() => setQuizKind("diagnostic")}>Take the placement quiz instead</button></div>
          ) : quizKind === "diagnostic" ? (
            <p className={s.sub}>Placement quiz · a short quiz across every topic to find your weak spots.{detail.progress?.diagnosticDone ? " You've taken it before; this sets your starting point again." : ""}</p>
          ) : null}
          <Quiz key={quizKind} setId={set.id} kind={quizKind} onKind={setQuizKind} onDone={() => { setTick((n) => n + 1); settled.current(); }} onOpen={() => onOpen({ kind: "study", id: set.id, tab: "quiz" })} />
        </>
      )}
    </section>
  );
}

/** Exam date and the day-by-day plan, as in the Study tab's Plan: weak topics first, flashcards daily, a mock exam before the test. */
function PlanPanel({ examDate, plan, busy, err, onSave, onGo, onOpen }: { examDate: string; plan: PlanDay[]; busy: boolean; err: string; onSave: (date: string) => void; onGo: (t: StudyTab) => void; onOpen: () => void }) {
  const [date, setDate] = useState(examDate);
  const shown = plan.slice(0, 7);
  return (
    <div className={s.panel} data-plan={plan.length ? "days" : "none"}>
      <form className={s.slideEditRow} onSubmit={(e) => { e.preventDefault(); if (date) onSave(date); }}>
        <label className={s.meta} htmlFor="exam-date">Exam date</label>
        <input id="exam-date" className={sl.input} type="date" value={date} min={localDay()} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        <Button type="submit" variant="primary" size="sm" disabled={busy || !date || date === examDate}>{busy ? "Saving…" : "Save and plan"}</Button>
        {examDate ? <button type="button" className={sl.linkBtn} disabled={busy} onClick={() => { setDate(""); onSave(""); }}>Clear</button> : null}
      </form>
      {err ? <p className={s.note} role="alert">{err}</p> : null}
      {shown.length ? (
        <ol className={s.steps} aria-label="Study plan">
          {shown.map((day, n) => (
            <li key={day.date} className={s.step}>
              <span className={s.n} aria-hidden="true">{n + 1}</span>
              <div>
                <p><strong>{day.label}.</strong></p>
                <ul className={s.planTasks}>{day.tasks.map((t, i) => <li key={i}>{t.text}{t.kind === "cards" ? <> <button type="button" className={sl.linkBtn} onClick={() => onGo("cards")}>Open</button></> : t.kind === "quiz" || t.kind === "mock" || t.kind === "review" ? <> <button type="button" className={sl.linkBtn} onClick={() => onGo("quiz")}>Open</button></> : null}</li>)}</ul>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className={s.note}>{examDate ? "Your exam is today or has passed, so there's nothing left to plan." : "Add an exam date to get a day-by-day plan: weak topics first, flashcards daily, a review day and a mock exam before the test."}</p>}
      {plan.length > shown.length ? <div className={s.actions}><span className={s.meta}>{plan.length - shown.length} more days to your exam.</span><button type="button" className={sl.linkBtn} onClick={onOpen}>See the whole plan in Study</button></div> : null}
    </div>
  );
}

type DeckCard = Card & { state: { box: number } | null };
type Grade = "again" | "hard" | "good" | "easy";

/** Every flashcard in the set, one at a time: flip, then grade it into the same spaced-repetition schedule the Study tab uses. */
function CardDeck({ setId, onDone, onOpen }: { setId: string; onDone: () => void; onOpen: () => void }) {
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [i, setI] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [graded, setGraded] = useState(0);
  useEffect(() => {
    let on = true;
    api<{ cards: DeckCard[] }>(`/api/study/sets/${setId}/cards?all=1`).then((r) => on && setCards(r.cards)).catch((e: Error) => on && setErr(e.message));
    return () => { on = false; };
  }, [setId]);
  if (err) return <p className={s.note} role="alert">{err}</p>;
  if (!cards) return <div className={s.skeleton} aria-hidden="true"><i /><i /></div>;
  if (!cards.length) return <p className={s.note}>This set has no flashcards.</p>;
  const done = i >= cards.length;
  const grade = async (g: Grade) => {
    const c = cards[i];
    setBusy(true);
    setErr("");
    try {
      await api(`/api/study/sets/${setId}/cards`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: c.id, grade: g }) });
      setGraded((n) => n + 1);
      setI((n) => n + 1);
      if (i + 1 >= cards.length) onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (done) {
    return (
      <div className={s.panel} data-deck="done">
        <p className={s.title}>Round done · {graded} {graded === 1 ? "card" : "cards"} reviewed</p>
        <p className={s.sub}>Each card is scheduled for review when you are about to forget it. Your mastery above is updated.</p>
        <div className={s.actions}>
          <Button variant="primary" size="sm" onClick={() => { setI(0); setGraded(0); }}>Go again</Button>
          <Button variant="secondary" size="sm" onClick={onOpen}>Open in Study</Button>
        </div>
      </div>
    );
  }
  return (
    <div className={s.deck}>
      <FlipCard key={cards[i].id} card={cards[i]} index={i} total={cards.length} />
      <div className={s.gradeRow} role="group" aria-label="How well did you know it?">
        {(["again", "hard", "good", "easy"] as const).map((g) => (
          <Button key={g} variant={g === "good" ? "primary" : "secondary"} size="sm" disabled={busy} onClick={() => void grade(g)}>{g[0].toUpperCase() + g.slice(1)}</Button>
        ))}
      </div>
      <div className={s.actions}>
        <button type="button" className={sl.linkBtn} disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>Previous card</button>
        <button type="button" className={sl.linkBtn} onClick={() => setI((n) => n + 1)}>Skip</button>
        <span className={s.meta}>Grade each card after you flip it.</span>
      </div>
    </div>
  );
}

type Graded = { correct: boolean; explanation: string; reference: string; feedback: string; credits: number };

/** The A-D quiz, right here: questions picked by the server (least seen and missed first), each graded on the server. */
function Quiz({ setId, kind = "practice", onKind, onDone, onOpen }: { setId: string; kind?: QuizKind; onKind?: (k: QuizKind) => void; onDone: () => void; onOpen: () => void }) {
  const [loaded, setLoaded] = useState<{ round: number; qs: PublicQuestion[] } | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Graded | null>(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [round, setRound] = useState(0);
  useEffect(() => {
    let on = true;
    api<{ questions: PublicQuestion[] }>(`/api/study/sets/${setId}/quiz`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) })
      .then((r) => { if (on) { setLoaded({ round, qs: r.questions }); setI(0); setScore(0); setPicked(null); setResult(null); setErr(""); } })
      .catch((e: Error) => on && setErr(e.message));
    return () => { on = false; };
  }, [setId, round, kind]);
  const qs = loaded && loaded.round === round ? loaded.qs : null;
  if (err && !qs) return <p className={s.note} role="alert">{err}</p>;
  if (!qs) return <div className={s.skeleton} aria-hidden="true"><i /><i /><i /></div>;
  if (i >= qs.length) {
    return (
      <div className={s.panel} data-quiz="done">
        <p className={s.title}>{kind === "diagnostic" ? "Placement quiz finished: " : "You got "}{score} of {qs.length}</p>
        <p className={s.sub}>{kind === "diagnostic" ? "Your starting mastery is set for every topic, and weak topics come first in quizzes and your plan." : "Missed questions come back first next round. Your mastery above is updated."}</p>
        <div className={s.actions}>
          {kind === "diagnostic" && onKind ? <Button variant="primary" size="sm" onClick={() => onKind("practice")}>Practice quiz</Button> : <Button variant="primary" size="sm" onClick={() => setRound((n) => n + 1)}>Another round</Button>}
          <Button variant="secondary" size="sm" onClick={onOpen}>Open in Study</Button>
        </div>
      </div>
    );
  }
  const q = qs[i];
  const answer = async (body: { choice?: number; answer?: string }) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<Graded>(`/api/study/sets/${setId}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: q.id, ...body, ...(kind === "diagnostic" && i === qs.length - 1 ? { finish: { kind: "diagnostic" } } : {}) }) });
      setResult(r);
      if (r.correct) setScore((n) => n + 1);
    } catch (e) { setErr((e as Error).message); setPicked(null); } finally { setBusy(false); }
  };
  const next = () => {
    setI((n) => n + 1);
    setPicked(null);
    setText("");
    setResult(null);
    if (i + 1 >= qs.length) {
      // Same as the Study tab: the finished placement quiz is recorded (diagnosticDone) with the questions it asked.
      if (kind === "diagnostic") void api(`/api/study/sets/${setId}/progress`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ids: qs.map((x) => x.id) }) }).catch(() => undefined).finally(onDone);
      else onDone();
    }
  };
  return (
    <div className={s.quiz} data-quiz="question">
      <p className={s.count}>Question {i + 1} of {qs.length} · {score} right</p>
      <p className={s.quizQ}>{q.q}</p>
      {q.type === "mc" && q.options ? (
        <ol className={s.options} aria-label="Answers">
          {q.options.map((o, k) => (
            <li key={k}>
              <button
                type="button"
                className={s.option}
                disabled={busy || result !== null}
                data-picked={picked === k || undefined}
                data-verdict={result && picked === k ? (result.correct ? "right" : "wrong") : result && !result.correct && o === result.reference ? "right" : undefined}
                onClick={() => { setPicked(k); void answer({ choice: k }); }}
              >
                <span className={s.letter} aria-hidden="true">{"ABCD"[k]}</span>
                <span>{o}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <form className={s.shortForm} onSubmit={(e) => { e.preventDefault(); if (text.trim()) void answer({ answer: text.trim() }); }}>
          <label className="visually-hidden" htmlFor={`qa-${q.id}`}>Your answer</label>
          <textarea id={`qa-${q.id}`} className={sl.input} rows={2} value={text} disabled={busy || result !== null} onChange={(e) => setText(e.target.value)} placeholder="Type your answer" />
          {result ? null : <Button type="submit" variant="primary" size="sm" disabled={busy || !text.trim()}>{busy ? "Checking…" : "Check"}</Button>}
        </form>
      )}
      {err ? <p className={s.note} role="alert">{err}</p> : null}
      {result ? (
        <div className={s.verdict} data-verdict={result.correct ? "right" : "wrong"} role="status">
          <p className={s.verdictHead}>{result.correct ? "Correct" : `Not quite · the answer: ${result.reference}`}</p>
          {result.feedback ? <p className={s.note}>{result.feedback}</p> : null}
          {result.explanation ? <p className={s.note}>{result.explanation}</p> : null}
          <div className={s.actions}><Button variant="primary" size="sm" onClick={next}>{i + 1 >= qs.length ? "See my score" : "Next question"}</Button></div>
        </div>
      ) : null}
    </div>
  );
}

/** One flashcard that turns over (3D flip; a plain swap under reduced motion). */
export function FlipCard({ card, index, total }: { card: Pick<Card, "front" | "back">; index: number; total: number }) {
  const [flip, setFlip] = useState(false);
  return (
    <div className={s.flashWrap}>
      <p className={s.count}>Flashcards · Card {index + 1} of {total}</p>
      <button type="button" className={s.flash} data-flipped={flip || undefined} onClick={() => setFlip((v) => !v)} aria-label={flip ? `Answer: ${card.back}. Show the question` : `Question: ${card.front}. Show the answer`}>
        <span className={s.flashInner}>
          <span className={s.face} data-face="front" aria-hidden={flip || undefined}><span className={s.faceK}>Question</span><span className={s.faceQ}>{card.front}</span></span>
          <span className={s.face} data-face="back" aria-hidden={!flip || undefined}><span className={s.faceK}>Answer</span><span className={s.faceQ}>{card.back}</span></span>
        </span>
      </button>
      <p className={s.meta}>{flip ? "Tap again for the question." : "Tap the card to reveal the answer."}</p>
    </div>
  );
}

/* ───────────── Slides ───────────── */

function SlidesCard({ message: m, user, ledger, onPatch, onOpen, onSettled, onAct }: Props) {
  const st = m.studio!;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [gone, setGone] = useState(false);
  const [present, setPresent] = useState<number | null>(null);
  const [saveErr, setSaveErr] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [instr, setInstr] = useState("");
  /** The selected slide's panel: ask Keplar to rewrite it, or edit its text and notes by hand (no model, no credits). */
  const [mode, setMode] = useState<"rewrite" | "text">("rewrite");
  const [draft, setDraft] = useState<SlideText>({ title: "", bullets: "", notes: "" });
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const patch = useRef(onPatch);
  const settled = useRef(onSettled);
  useEffect(() => { patch.current = onPatch; settled.current = onSettled; });

  useEffect(() => {
    if (st.phase !== "waiting" || !ledger.synced) return;
    if (!ledger.signedIn) { patch.current({ phase: "signin" }); return; }
    if (!canUseSlides(ledger.plan)) { patch.current({ phase: "locked" }); return; }
    if (started.has(m.id)) return;
    started.add(m.id);
    const op = st.op;
    // A follow-up on a deck already made: rewrite one slide (charged by actual cost), switch the theme, or present it (free).
    if (op && st.id) {
      const id = st.id;
      patch.current({ phase: "working", ...(op.type === "slide" ? { changed: op.index } : op.type === "move" ? { changed: op.to } : {}) });
      const work: Promise<{ deck: Deck; credits?: number }> =
        op.type === "slide"
          ? api<{ deck: Deck; credits: number }>(`/api/slides/decks/${id}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index: op.index, instruction: op.instruction }) })
          : api<{ deck: Deck }>(`/api/slides/decks/${id}`).then(async (r) => {
              if (op.type === "move") {
                if (op.from >= r.deck.slides.length || op.to >= r.deck.slides.length) throw Object.assign(new Error(`This deck has ${r.deck.slides.length} slides now, so slide ${Math.max(op.from, op.to) + 1} isn't there. Nothing was moved.`), { status: 409 });
                return api<{ deck: Deck }>(`/api/slides/decks/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slides: moveSlide(r.deck.slides, op.from, op.to) }) });
              }
              // "delete slide 5" only opens the deck: the card asks for a confirm click before anything is removed.
              if (op.type !== "theme" || r.deck.theme === op.theme) return r;
              return api<{ deck: Deck }>(`/api/slides/decks/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: op.theme }) });
            });
      work
        .then((r) => {
          setDeck(r.deck);
          patch.current({ phase: "ready", title: r.deck.title, count: r.deck.slides.length, theme: r.deck.theme, ...(r.credits ? { credits: r.credits } : {}) });
          if (op.type === "present") setPresent(0);
        })
        .catch((e: ApiErr) => patch.current({ phase: "failed", error: e.status === 404 ? "That deck was deleted. Make a new one with /slides." : e.message }))
        .finally(() => settled.current());
      return;
    }
    const L = slidesLimitsFor(ledger.plan)!;
    const req = deckRequestFrom(st.brief || user?.text || "", L.maxSlides);
    const material = (docsFor(user?.attachments) ?? []).map((d) => d.text).join("\n\n").slice(0, L.maxMaterialChars);
    patch.current({ phase: "working", count: req.count });
    api<{ deck: Deck; credits: number }>("/api/slides/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...req, material, style: "clean", theme: "dark" }) })
      .then((r) => { setDeck(r.deck); patch.current({ phase: "ready", id: r.deck.id, title: r.deck.title, count: r.deck.slides.length, theme: r.deck.theme, credits: r.credits }); })
      .catch((e: Error) => patch.current({ phase: "failed", error: e.message }))
      .finally(() => settled.current());
  }, [st.phase, st.op, st.id, st.brief, m.id, ledger.synced, ledger.signedIn, ledger.plan, user]);

  useEffect(() => {
    if (st.phase !== "ready" || !st.id || deck?.id === st.id) return;
    let on = true;
    api<{ deck: Deck }>(`/api/slides/decks/${st.id}`).then((r) => on && setDeck(r.deck)).catch((e: ApiErr) => on && e.status === 404 && setGone(true));
    return () => { on = false; };
  }, [st.phase, st.id, deck?.id]);

  const setTheme = async (theme: DeckTheme) => {
    if (!deck || deck.theme === theme) return;
    const next = { ...deck, theme };
    setDeck(next);
    setSaveErr("");
    try {
      await api(`/api/slides/decks/${deck.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: next.title, theme, slides: next.slides }) });
      patch.current({ theme });
    } catch (e) { setSaveErr((e as Error).message); }
  };

  /** Saves hand edits (text, order, a deleted slide) with the same PUT the Slides tab uses; the card shows the change at once. */
  const saveSlides = async (slides: Slide[], done: string, extra?: Partial<Studio>) => {
    if (!deck) return false;
    const prev = deck;
    setDeck({ ...deck, slides });
    setSaveErr("");
    setSaved("");
    setSaving(true);
    try {
      const r = await api<{ deck: Deck }>(`/api/slides/decks/${deck.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slides }) });
      setDeck(r.deck);
      setSaved(done);
      patch.current({ count: r.deck.slides.length, ...extra });
      return true;
    } catch (e) {
      setDeck(prev);
      setSaveErr((e as Error).message);
      return false;
    } finally { setSaving(false); }
  };

  const pick = (i: number | null) => {
    setSel(i);
    setInstr("");
    setConfirmDel(null);
    setSaved("");
    const x = i === null ? null : deck?.slides[i];
    if (x) setDraft({ title: x.title, bullets: bulletsToText(x.bullets), notes: x.notes });
  };

  const saveText = async (index: number) => {
    if (!deck) return;
    const r = withSlideText(deck.slides, index, draft);
    if (r.error) { setSaveErr(r.error); return; }
    if (r.slides === deck.slides) { setSaved("No changes to save."); return; }
    await saveSlides(r.slides, `Saved slide ${index + 1}.`);
  };

  const move = async (index: number, to: number) => {
    if (!deck) return;
    const next = moveSlide(deck.slides, index, to);
    if (next === deck.slides) return;
    if (await saveSlides(next, `Moved to position ${to + 1}.`)) setSel(to);
  };

  const remove = async (index: number, fromOp = false) => {
    if (!deck) return;
    const next = removeSlide(deck.slides, index);
    if (!next) { setSaveErr("A deck keeps at least one slide."); return; }
    const title = deck.slides[index]?.title ?? "";
    if (await saveSlides(next, `Deleted slide ${index + 1}${title ? `, “${title}”` : ""}.`, fromOp ? { opDone: "done" } : undefined)) { setSel(null); setConfirmDel(null); }
  };

  const rewrite = (index: number) => {
    const text = instr.trim();
    if (!deck || !text || !onAct) return;
    setInstr("");
    setSel(null);
    onAct(`Slide ${index + 1}: ${text}`, { type: "slides.edit", deckId: deck.id, index, instruction: text });
  };

  if (st.phase === "signin" || st.phase === "locked") {
    return (
      <section className={s.card} data-studio="slides" data-phase={st.phase}>
        <Head busy={false} label="Slides" chip="Plus and Pro" />
        <p className={s.note}>Keplar writes the deck from your message, with speaker notes, then you edit it here (&ldquo;make slide 3 shorter&rdquo;), present it fullscreen and export it to PowerPoint or PDF. Slides is part of Keplar Plus and Pro{st.phase === "locked" ? "; your plan doesn't include it, so nothing was made or charged" : ""}.</p>
        <div className={s.actions}>
          <Link href="/checkout?plan=plus" className={sl.primary} data-upgrade="slides">Upgrade to Plus</Link>
          {st.phase === "signin" ? <Link href="/signin?next=/app" className={sl.ghost}>Sign in</Link> : null}
          <Link href="/pricing" className={sl.ghost}>See plans</Link>
        </div>
      </section>
    );
  }
  if (st.phase === "failed" || st.phase === "interrupted") {
    return (
      <section className={s.card} data-studio="slides" data-phase={st.phase}>
        <Head busy={false} label={st.op?.type === "slide" ? "Slide not rewritten" : st.op ? "Deck not changed" : "Deck not made"} />
        <p className={s.note} role={st.phase === "failed" ? "alert" : undefined}>{st.phase === "interrupted" ? "The page reloaded while the deck was being written. If it finished, it is in the Slides tab." : st.error}</p>
        {st.phase === "interrupted" || st.id ? <div className={s.actions}><Button variant="secondary" size="sm" onClick={() => onOpen({ kind: "slides", id: st.id ?? "" })}>Open in Slides</Button></div> : null}
      </section>
    );
  }
  if (st.phase !== "ready" || !deck) {
    const n = st.count ?? 6;
    const label = gone ? "This deck was deleted" : st.op?.type === "slide" ? `Rewriting slide ${st.op.index + 1}` : st.op ? "Opening the deck" : `Writing slides · ${n} slides`;
    return (
      <section className={s.card} data-studio="slides" data-phase="working" aria-busy="true">
        <Head busy={!gone} label={label} />
        {gone ? null : <div className={s.grid} aria-hidden="true">{Array.from({ length: Math.min(n, 9) }, (_, i) => <div key={i} className={s.ghostSlide} style={{ "--i": i } as CSSProperties} />)}</div>}
      </section>
    );
  }
  const themeLabel = THEMES.find((t) => t.id === deck.theme)?.label ?? "Dark";
  const op = st.op;
  const opChip = op?.type === "slide" ? `Rewrote slide ${op.index + 1}` : op?.type === "theme" ? `${themeLabel} theme` : op?.type === "move" ? `Moved slide ${op.from + 1} to ${op.to + 1}`
    : op?.type === "delete" ? (st.opDone === "done" ? `Deleted slide ${op.index + 1}` : st.opDone === "cancelled" ? `Slide ${op.index + 1} kept` : `Delete slide ${op.index + 1}?`) : undefined;
  const pendingDelete = op?.type === "delete" && !st.opDone ? op.index : null;
  return (
    <section className={s.card} data-studio="slides" data-phase="ready" aria-label={`Deck: ${deck.title}`}>
      {opChip ? <Head busy={false} label="Slides" chip={opChip} /> : null}
      <div className={s.deckHead}>
        <div className={s.deckTitle}>
          <h3 className={s.title}>{deck.title}</h3>
          <span className={s.sub}>{deck.slides.length} slides · {themeLabel} theme</span>
        </div>
        <SegmentedControl label="Deck theme" size="sm" value={deck.theme} onValueChange={(v) => void setTheme(v)} options={THEMES.map((t) => ({ value: t.id, label: t.label }))} />
        <Button variant="primary" size="sm" onClick={() => setPresent(sel ?? 0)}>Present</Button>
        <a className={sl.ghost} href={`/api/slides/decks/${deck.id}/export?format=pptx`} download>PPTX</a>
        <a className={sl.ghost} href={`/api/slides/decks/${deck.id}/export?format=pdf`} download>PDF</a>
      </div>
      {pendingDelete !== null ? (
        deck.slides[pendingDelete] && deck.slides.length > 1
          ? <Confirm text={`Delete slide ${pendingDelete + 1}, “${deck.slides[pendingDelete].title}”, from ${deck.title}? Its text and speaker notes go with it.`} yes="Delete slide" busy={saving} onYes={() => void remove(pendingDelete, true)} onNo={() => patch.current({ opDone: "cancelled" })} />
          : <p className={s.note} role="alert">{deck.slides.length <= 1 ? "That's the only slide, and a deck keeps at least one, so nothing was deleted." : `This deck has ${deck.slides.length} slides now, so there's no slide ${pendingDelete + 1}. Nothing was deleted.`}</p>
      ) : null}
      {saveErr ? <p className={s.note} role="alert">{saveErr}</p> : null}
      {saved && !saveErr ? <p className={s.meta} role="status">{saved}</p> : null}
      <ol className={s.grid} aria-label="Slides">
        {deck.slides.map((x, i) => (
          <li key={x.id} data-changed={(st.changed === i && sel === null) || pendingDelete === i || undefined}>
            <button type="button" className={s.thumb} aria-pressed={sel === i} onClick={() => pick(sel === i ? null : i)} aria-label={`Slide ${i + 1}: ${x.title}. Change it`}>
              <SlideView slide={x} theme={deck.theme} index={i} />
            </button>
            <span className={s.thumbN} aria-hidden="true">{i + 1}</span>
          </li>
        ))}
      </ol>
      {sel !== null && deck.slides[sel] ? (
        <div className={s.slideEdit} data-slide-edit={sel}>
          <div className={s.slideEditHead}>
            <span className={s.meta}>Slide {sel + 1} of {deck.slides.length} · {deck.slides[sel].title}</span>
            <SegmentedControl label="How to change this slide" size="sm" value={mode} onValueChange={setMode} options={[{ value: "rewrite", label: "Ask Keplar" }, { value: "text", label: "Edit text" }]} />
          </div>
          {mode === "rewrite" ? (
            <form className={s.slideEditRow} onSubmit={(e) => { e.preventDefault(); rewrite(sel); }}>
              <input id={`se-${m.id}`} aria-label={`How should slide ${sel + 1} change?`} className={sl.input} value={instr} maxLength={500} autoFocus onChange={(e) => setInstr(e.target.value)} placeholder="How should this slide change? e.g. shorter, add a statistic" />
              <Button type="submit" variant="primary" size="sm" disabled={!instr.trim() || !onAct}>Rewrite</Button>
            </form>
          ) : (
            <form className={s.textEdit} onSubmit={(e) => { e.preventDefault(); void saveText(sel); }}>
              <label className={s.field}><span>Title</span><input className={sl.input} value={draft.title} maxLength={FIELD_MAX.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label className={s.field}><span>Bullets · one per line, up to {FIELD_MAX.bullets}</span><textarea className={s.textarea} rows={5} value={draft.bullets} onChange={(e) => setDraft({ ...draft, bullets: e.target.value })} /></label>
              <label className={s.field}><span>Speaker notes</span><textarea className={s.textarea} rows={4} value={draft.notes} maxLength={FIELD_MAX.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
              <div className={s.actions}>
                <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? "Saving…" : "Save slide"}</Button>
                <Button variant="secondary" size="sm" disabled={saving} onClick={() => pick(sel)}>Undo changes</Button>
              </div>
            </form>
          )}
          {confirmDel === sel ? (
            <Confirm text={`Delete slide ${sel + 1}, “${deck.slides[sel].title}”? Its text and speaker notes go with it.`} yes="Delete slide" busy={saving} onYes={() => void remove(sel)} onNo={() => setConfirmDel(null)} />
          ) : (
            <div className={s.actions}>
              <button type="button" className={sl.linkBtn} disabled={saving || sel === 0} onClick={() => void move(sel, sel - 1)} aria-label={`Move slide ${sel + 1} earlier`}>Move earlier</button>
              <button type="button" className={sl.linkBtn} disabled={saving || sel === deck.slides.length - 1} onClick={() => void move(sel, sel + 1)} aria-label={`Move slide ${sel + 1} later`}>Move later</button>
              <button type="button" className={sl.linkBtn} disabled={saving || deck.slides.length <= 1} onClick={() => setConfirmDel(sel)} data-delete-slide="">Delete slide</button>
              <button type="button" className={sl.linkBtn} onClick={() => setPresent(sel)}>Present from here</button>
              <button type="button" className={sl.linkBtn} onClick={() => onOpen({ kind: "slides", id: deck.id, slide: sel })}>Open this slide in Slides</button>
            </div>
          )}
        </div>
      ) : null}
      <div className={s.actions}>
        <Button variant="secondary" size="sm" onClick={() => onOpen({ kind: "slides", id: deck.id, slide: sel ?? 0 })}>Open in Slides</Button>
        <span className={s.meta}>Pick a slide to edit, move or delete it, or say &ldquo;make slide 3 shorter&rdquo; or &ldquo;move slide 4 to 2&rdquo;.{st.credits ? ` Charged ${st.credits} credits.` : ""}</span>
      </div>
      {present !== null ? <Present deck={deck} start={present} onClose={() => setPresent(null)} /> : null}
    </section>
  );
}
