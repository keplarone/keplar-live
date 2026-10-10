"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlan } from "@/components/billing/usePlan";
import { studyLimitsFor } from "@/lib/tools/limits";
import type { AskReply, Card, CardState, PublicQuestion, StudySet } from "@/lib/study/types";
import type { PlanDay, TopicMastery } from "@/lib/study/progress";
import { STUDY_OPEN_KEY, takeHandoff } from "@/components/app-ui/studio/handoff";
import c from "@/components/slides/slides.module.css";
import s from "./study.module.css";

type Row = { id: string; title: string; pages: number; topics: number; cards: number; questions: number; examDate: string | null; updatedAt: string };
type Detail = {
  set: Omit<StudySet, "questions"> & { questionCount: number };
  progress: { diagnosticDone: boolean; mock: { at: string; score: number; total: number }[]; streak: { current: number; best: number }; mastery: TopicMastery[]; overall: number | null; dueCards: number; cardStates: Record<string, CardState> };
  plan: PlanDay[];
};
type Tab = "overview" | "cards" | "quiz" | "plan" | "ask" | "progress";
type Err = Error & { status?: number; code?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: res.status, code: data.code }) as Err;
  return data;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function StudyMode() {
  const me = usePlan();
  if (!me.ready) return <div className={c.studio} aria-busy="true" />;
  if (!me.signedIn) {
    return (
      <div className={c.studio}>
        <section className={c.locked} aria-labelledby="st-in">
          <h2 id="st-in" className={c.lockedTitle}>Study mode</h2>
          <p className={c.lockedBody}>Upload a study guide and Keplar builds an outline, flashcards, quizzes, a study plan and a chat that answers only from your material. Sign in so your sets and progress are saved. Study mode is on every plan, including Free.</p>
          <div className={c.lockedActions}>
            <Link href="/signin?next=/app/study" className={c.primary}>Sign in</Link>
            <Link href="/signup?next=/app/study" className={c.ghost}>Create a free account</Link>
          </div>
        </section>
      </div>
    );
  }
  return <Study plan={me.plan} />;
}

function Study({ plan }: { plan: "free" | "lite" | "plus" | "pro" | "business" }) {
  const L = studyLimitsFor(plan);
  const [rows, setRows] = useState<Row[] | null>(null);
  // "Open in Study" from a chat card opens that set (and tab) once.
  const [handoff] = useState(() => takeHandoff<{ id?: string; tab?: Tab }>(STUDY_OPEN_KEY));
  const [openId, setOpenId] = useState<string | null>(handoff?.id || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [exam, setExam] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try { setRows((await api<{ sets: Row[] }>("/api/study/sets")).sets); } catch (e) { setError((e as Error).message); setRows([]); }
  }, []);
  useEffect(() => {
    let on = true;
    api<{ sets: Row[] }>("/api/study/sets").then((r) => on && setRows(r.sets)).catch((e: Error) => { if (on) { setError(e.message); setRows([]); } });
    return () => { on = false; };
  }, []);

  const build = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (text.trim()) fd.append("text", text);
      if (title.trim()) fd.append("title", title);
      if (exam) fd.append("examDate", exam);
      const r = await api<{ id: string; truncated: boolean; coverage: number }>("/api/study/sets", { method: "POST", body: fd });
      setFile(null); setText(""); setTitle(""); setExam("");
      setNotice(r.truncated || r.coverage < 1 ? `Your guide is longer than your plan reads at once, so Keplar used about ${Math.round(Math.min(r.coverage, 1) * 100)}% of it.` : "");
      await refresh(); setOpenId(r.id);
      window.dispatchEvent(new Event("focus"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (openId) return <SetView id={openId} plan={plan} notice={notice} initialTab={openId === handoff?.id ? handoff?.tab : undefined} onBack={() => { setOpenId(null); setNotice(""); void refresh(); }} />;

  return (
    <div className={c.studio}>
      <header className={c.head}>
        <div>
          <h1 className={c.title}>Study</h1>
          <p className={c.lede}>Upload your study guide. Keplar builds the outline, flashcards, quizzes and a plan, and answers questions using only your material.</p>
        </div>
      </header>
      {error ? <p className={c.error} role="alert">{error}</p> : null}
      <div className={c.grid}>
        <form className={c.card} onSubmit={(e) => { e.preventDefault(); void build(); }}>
          <div className={c.field}>
            <span className={c.label}>Study guide <em>(PDF, .txt or .md · up to {Math.round(L.maxUploadBytes / 1048576)} MB and {L.maxPages} pages)</em></span>
            <div className={c.fileRow}>
              <input id="st-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className={c.fileInput} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="st-file" className={c.ghost}>{file ? "Change file" : "Choose file"}</label>
              {file ? <span className={c.fileName}>{file.name}</span> : <span className={c.hint}>Text-based PDFs only. Scanned pages can&rsquo;t be read yet.</span>}
            </div>
          </div>
          <label className={c.field}>
            <span className={c.label}>Or paste text</span>
            <textarea className={c.input} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your notes or study guide here." disabled={Boolean(file)} />
          </label>
          <div className={c.row}>
            <label className={c.field}><span className={c.label}>Title <em>(optional)</em></span><input className={c.input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className={c.field}><span className={c.label}>Exam date <em>(optional)</em></span><input className={c.input} type="date" value={exam} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExam(e.target.value)} /></label>
          </div>
          <div className={c.submitRow}>
            <button type="submit" className={c.primary} disabled={busy || (!file && text.trim().length < 80)}>{busy ? "Reading and building…" : "Build my study set"}</button>
            <span className={c.estimate}>{plan === "free" ? "Free: runs on free models, so it can be slower. No credits used." : "Charged by actual cost, shown in your usage."}</span>
          </div>
          <p className={c.hint}>Keplar treats your document as material to learn from, never as instructions. Answers come from the document, and Keplar says when something isn&rsquo;t in it.</p>
        </form>
        <aside className={c.card} aria-labelledby="st-sets">
          <h2 id="st-sets" className={c.cardTitle}>Your study sets</h2>
          {rows === null ? <p className={c.hint}>Loading…</p> : rows.length ? (
            <ul className={c.deckList}>
              {rows.map((r) => (
                <li key={r.id} className={c.deckRow}>
                  <button type="button" className={c.deckOpen} onClick={() => setOpenId(r.id)}>
                    <span className={c.deckName}>{r.title}</span>
                    <span className={c.deckMeta}>{r.pages} pages · {r.topics} topics · {r.cards} cards{r.examDate ? ` · exam ${r.examDate}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className={c.hint}>Your sets and progress are saved here.</p>}
        </aside>
      </div>
    </div>
  );
}

function SetView({ id, plan, notice, initialTab, onBack }: { id: string; plan: string; notice: string; initialTab?: Tab; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setD(await api<Detail>(`/api/study/sets/${id}`)); } catch (e) { setError((e as Error).message); } }, [id]);
  useEffect(() => {
    let on = true;
    api<Detail>(`/api/study/sets/${id}`).then((r) => on && setD(r)).catch((e: Error) => on && setError(e.message));
    return () => { on = false; };
  }, [id]);

  const del = async () => {
    if (!window.confirm("Delete this study set, its text and your progress? This can't be undone.")) return;
    try { await api(`/api/study/sets/${id}`, { method: "DELETE" }); onBack(); } catch (e) { setError((e as Error).message); }
  };
  const setExam = async (date: string) => { try { await api(`/api/study/sets/${id}`, jsonInit("PATCH", { examDate: date || null })); await load(); } catch (e) { setError((e as Error).message); } };

  if (!d) return <div className={c.studio}>{error ? <p className={c.error} role="alert">{error}</p> : <p className={c.hint}>Loading…</p>}<button type="button" className={c.ghost} onClick={onBack}>Back</button></div>;
  const tabs: [Tab, string][] = [["overview", "Overview"], ["cards", `Flashcards${d.progress.dueCards ? ` · ${d.progress.dueCards} due` : ""}`], ["quiz", "Quiz"], ["plan", "Plan"], ["ask", "Ask the guide"], ["progress", "Progress"]];
  return (
    <div className={c.studio}>
      <header className={c.head}>
        <div>
          <button type="button" className={c.linkBtn} onClick={onBack}>← All study sets</button>
          <h1 className={c.title}>{d.set.title}</h1>
          <p className={c.lede}>{d.set.source.pages} pages · {d.set.topics.length} topics · {d.set.cards.length} flashcards · {d.set.questionCount} questions</p>
        </div>
        <div className={s.streak} title={`Best: ${d.progress.streak.best} days`}><strong>{d.progress.streak.current}</strong><span>day streak</span></div>
      </header>
      {notice || d.set.coverage < 1 || d.set.source.truncated ? <p className={s.note}>{notice || `Your guide is longer than your plan reads at once, so about ${Math.round(d.set.coverage * 100)}% of it was used.`}</p> : null}
      {error ? <p className={c.error} role="alert">{error}</p> : null}
      <div className={s.tabs} role="tablist" aria-label="Study sections">
        {tabs.map(([k, label]) => <button key={k} id={`tab-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls="st-panel" className={s.tab} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div id="st-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={s.panel}>
        {tab === "overview" ? <Overview d={d} /> : null}
        {tab === "cards" ? <Cards id={id} onChange={load} /> : null}
        {tab === "quiz" ? <Quiz id={id} d={d} onDone={load} /> : null}
        {tab === "plan" ? <Plan d={d} onExam={setExam} onGo={setTab} /> : null}
        {tab === "ask" ? <Ask id={id} plan={plan} /> : null}
        {tab === "progress" ? <Progress d={d} /> : null}
      </div>
      <button type="button" className={c.linkBtn} onClick={() => void del()}>Delete this study set</button>
    </div>
  );
}

function Overview({ d }: { d: Detail }) {
  return (
    <div className={s.stack}>
      <section className={c.card}><h2 className={c.cardTitle}>Plain-English summary</h2><p className={s.prose}>{d.set.summary}</p></section>
      {d.set.topics.map((t) => (
        <section key={t.id} className={c.card}>
          <h2 className={c.cardTitle}>{t.name} <span className={s.pages}>pp. {t.pageFrom}{t.pageTo > t.pageFrom ? `–${t.pageTo}` : ""}</span></h2>
          {t.outline.length ? <ul className={s.list}>{t.outline.map((o, i) => <li key={i}>{o}</li>)}</ul> : null}
          {t.concepts.length ? <dl className={s.defs}>{t.concepts.map((k) => <div key={k.term}><dt>{k.term}</dt><dd>{k.definition} <span className={s.pages}>p. {k.page}</span></dd></div>)}</dl> : null}
        </section>
      ))}
    </div>
  );
}

function Cards({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [cards, setCards] = useState<(Card & { state: CardState | null })[] | null>(null);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
    useEffect(() => {
    let on = true;
    api<{ cards: (Card & { state: CardState | null })[] }>(`/api/study/sets/${id}/cards${all ? "?all=1" : ""}`)
      .then((r) => { if (on) { setCards(r.cards); setI(0); setFlip(false); } })
      .catch((e: Error) => on && setError(e.message));
    return () => { on = false; };
  }, [id, all]);
  if (error) return <p className={c.error} role="alert">{error}</p>;
  if (!cards) return <p className={c.hint}>Loading…</p>;
  if (!cards.length || i >= cards.length) {
    return (
      <div className={c.card}>
        <h2 className={c.cardTitle}>{cards.length ? "Session done" : "Nothing due today"}</h2>
        <p className={s.prose}>{cards.length ? "Cards you rated come back on a schedule: hard ones soon, easy ones later." : "Cards come back when they are due. You can also review everything now."}</p>
        <button type="button" className={c.ghost} onClick={() => { setAll(true); setCards(null); }}>Review all cards</button>
      </div>
    );
  }
  const card = cards[i];
  const grade = async (g: "again" | "hard" | "good" | "easy") => {
    try { await api(`/api/study/sets/${id}/cards`, jsonInit("POST", { cardId: card.id, grade: g })); setFlip(false); setI((v) => v + 1); void onChange(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className={s.cardWrap}>
      <p className={s.count}>Flashcards · Card {i + 1} of {cards.length}{card.state ? ` · box ${card.state.box}` : " · new"}</p>
      <button key={card.id} type="button" className={s.flash} data-flipped={flip || undefined} onClick={() => setFlip((v) => !v)} aria-label={flip ? `Answer: ${card.back}. Show the question` : `Question: ${card.front}. Show the answer`}>
        <span className={s.flashInner}>
          <span className={s.face} data-face="front" aria-hidden={flip || undefined}>
            <span className={s.flashSide}>Question</span>
            <span className={s.flashText}>{card.front}</span>
            <span className={s.pages}>p. {card.page}</span>
          </span>
          <span className={s.face} data-face="back" aria-hidden={!flip || undefined}>
            <span className={s.flashSide}>Answer</span>
            <span className={s.flashText}>{card.back}</span>
            <span className={s.pages}>p. {card.page}</span>
          </span>
        </span>
      </button>
      {flip ? (
        <div className={s.grades} role="group" aria-label="How well did you know it?">
          <button type="button" className={c.ghost} onClick={() => void grade("again")}>Again</button>
          <button type="button" className={c.ghost} onClick={() => void grade("hard")}>Hard</button>
          <button type="button" className={c.primary} onClick={() => void grade("good")}>Good</button>
          <button type="button" className={c.ghost} onClick={() => void grade("easy")}>Easy</button>
        </div>
      ) : <p className={c.hint}>Tap the card to reveal the answer.</p>}
    </div>
  );
}

type Result = { correct: boolean; explanation: string; reference: string; feedback: string; page: number };

function Quiz({ id, d, onDone }: { id: string; d: Detail; onDone: () => Promise<void> }) {
  const [kind, setKind] = useState<string | null>(null);
  const [qs, setQs] = useState<PublicQuestion[]>([]);
  const [i, setI] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState<{ ok: number; missed: string[] }>({ ok: 0, missed: [] });
  const [finished, setFinished] = useState(false);

  const start = async (k: string) => {
    setError(""); setBusy(true);
    try {
      const r = await api<{ questions: PublicQuestion[] }>(`/api/study/sets/${id}/quiz`, jsonInit("POST", { kind: k }));
      setKind(k); setQs(r.questions); setI(0); setRes(null); setChoice(null); setText(""); setScore({ ok: 0, missed: [] }); setFinished(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const q = qs[i];
  const submit = async () => {
    if (!q) return;
    setError(""); setBusy(true);
    try {
      const r = await api<Result>(`/api/study/sets/${id}/answer`, jsonInit("POST", { questionId: q.id, choice, answer: text, finish: kind === "diagnostic" && i === qs.length - 1 ? { kind: "diagnostic" } : undefined }));
      setRes(r); setScore((s0) => ({ ok: s0.ok + (r.correct ? 1 : 0), missed: r.correct ? s0.missed : [...s0.missed, q.topicId] }));
      window.dispatchEvent(new Event("focus"));
      void onDone(); // the server recorded the answer: refresh mastery for the bar under the question
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const next = async () => {
    setRes(null); setChoice(null); setText("");
    if (i + 1 >= qs.length) {
      setFinished(true);
      if (kind === "mock" || kind === "diagnostic") { try { await api(`/api/study/sets/${id}/progress`, jsonInit("POST", { kind, ids: qs.map((x) => x.id) })); } catch { /* the answers are already saved */ } }
      void onDone();
    } else setI(i + 1);
  };
  const weak = useMemo(() => d.progress.mastery.filter((m) => m.level === "weak"), [d]);

  if (!kind || finished) {
    const names = [...new Set(score.missed)].map((t) => d.progress.mastery.find((m) => m.topicId === t)?.name).filter(Boolean);
    return (
      <div className={s.stack}>
        {finished ? (
          <section className={c.card}>
            <h2 className={c.cardTitle}>{kind === "mock" ? "Mock exam" : kind === "diagnostic" ? "Diagnostic" : "Quiz"} finished: {score.ok} of {qs.length}</h2>
            {names.length ? <p className={s.prose}>Topics to revisit: {names.join(", ")}. Try an adaptive quiz to focus on them.</p> : <p className={s.prose}>No misses. Nice work.</p>}
          </section>
        ) : null}
        {error ? <p className={c.error} role="alert">{error}</p> : null}
        <section className={c.card}>
          <h2 className={c.cardTitle}>Choose a quiz</h2>
          {!d.progress.diagnosticDone ? <p className={s.note}>Start with the diagnostic: a short quiz across every topic to find your weak spots.</p> : null}
          <div className={s.quizGrid}>
            <QuizBtn label="Diagnostic" hint="Find weak spots" onClick={() => void start("diagnostic")} busy={busy} primary={!d.progress.diagnosticDone} />
            <QuizBtn label="Practice" hint="Mixed questions" onClick={() => void start("practice")} busy={busy} />
            <QuizBtn label="Adaptive" hint={weak.length ? `Focus on ${weak.length} weak topic${weak.length > 1 ? "s" : ""}` : "Targets what you missed"} onClick={() => void start("adaptive")} busy={busy} primary={d.progress.diagnosticDone && weak.length > 0} />
            <QuizBtn label="Mock exam" hint="Full exam, balanced" onClick={() => void start("mock")} busy={busy} />
          </div>
        </section>
      </div>
    );
  }
  if (!q) return null;
  const topicMastery = d.progress.mastery.find((m) => m.topicId === q.topicId);
  return (
    <section className={c.card} aria-live="polite">
      <p className={s.count}>{kind[0].toUpperCase() + kind.slice(1)} · question {i + 1} of {qs.length}</p>
      <h2 className={s.question}>{q.q}</h2>
      {q.type === "mc" ? (
        <div className={s.options} role="radiogroup" aria-label="Answer options">
          {q.options?.map((o, k) => {
            const state = res ? (k === choice ? (res.correct ? "right" : "wrong") : undefined) : undefined;
            return (
              <button key={k} type="button" role="radio" aria-checked={choice === k} className={s.option} data-state={state} disabled={Boolean(res)} onClick={() => setChoice(k)}>
                <span className={s.optLetter} aria-hidden="true">{String.fromCharCode(65 + k)}</span>
                <span className={s.optText}>{o}</span>
                {state ? <span className={s.optTag} data-state={state}>{state === "right" ? "✓ Correct" : "✕ Not quite"}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea className={c.input} rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={Boolean(res)} maxLength={1200} placeholder="Write your answer in your own words." aria-label="Your answer" />
      )}
      {res ? (
        <div className={s.feedback} data-ok={res.correct || undefined} role="status">
          <strong>{res.correct ? "Correct" : "Not quite"}</strong>
          {!res.correct ? <p>Answer: {res.reference}</p> : null}
          {res.feedback ? <p>{res.feedback}</p> : null}
          <p>{res.explanation} <span className={s.pages}>p. {res.page}</span></p>
        </div>
      ) : null}
      {topicMastery && topicMastery.mastery !== null ? (
        <div className={s.mastery}>
          <span>Mastery · {topicMastery.name}</span>
          <div className={s.track} role="meter" aria-label={`${topicMastery.name} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(topicMastery.mastery * 100)}><span data-level={topicMastery.level} style={{ width: `${Math.round(topicMastery.mastery * 100)}%` }} /></div>
          <strong>{pct(topicMastery.mastery)}</strong>
        </div>
      ) : null}
      {error ? <p className={c.error} role="alert">{error}</p> : null}
      <div className={c.submitRow}>
        {!res ? <button type="button" className={c.primary} onClick={() => void submit()} disabled={busy || (q.type === "mc" ? choice === null : text.trim().length < 2)}>{busy ? "Checking…" : "Check answer"}</button> : <button type="button" className={c.primary} onClick={() => void next()}>{i + 1 >= qs.length ? "Finish" : "Next"}</button>}
      </div>
    </section>
  );
}
const QuizBtn = ({ label, hint, onClick, busy, primary }: { label: string; hint: string; onClick: () => void; busy: boolean; primary?: boolean }) => (
  <button type="button" className={s.quizBtn} data-primary={primary || undefined} onClick={onClick} disabled={busy}><strong>{label}</strong><span>{hint}</span></button>
);

function Plan({ d, onExam, onGo }: { d: Detail; onExam: (date: string) => void; onGo: (t: Tab) => void }) {
  const [date, setDate] = useState(d.set.examDate ?? "");
  return (
    <div className={s.stack}>
      <section className={c.card}>
        <h2 className={c.cardTitle}>Exam date</h2>
        <div className={c.fileRow}>
          <input className={c.input} style={{ maxWidth: 220 }} type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="Exam date" />
          <button type="button" className={c.primary} onClick={() => onExam(date)}>Save and plan</button>
          {d.set.examDate ? <button type="button" className={c.linkBtn} onClick={() => { setDate(""); onExam(""); }}>Clear</button> : null}
        </div>
      </section>
      {d.plan.length ? d.plan.map((day) => (
        <section key={day.date} className={c.card}>
          <h2 className={c.cardTitle}>{day.label}</h2>
          <ul className={s.list}>{day.tasks.map((t, i) => <li key={i}>{t.text} {t.kind === "cards" ? <button type="button" className={c.linkBtn} onClick={() => onGo("cards")}>Open</button> : t.kind === "quiz" || t.kind === "mock" || t.kind === "review" ? <button type="button" className={c.linkBtn} onClick={() => onGo("quiz")}>Open</button> : null}</li>)}</ul>
        </section>
      )) : <p className={c.hint}>Add an exam date to get a day-by-day plan: weak topics first, flashcards daily, a review day and a mock exam before the test.</p>}
    </div>
  );
}

type Msg = { role: "me" | "keplar"; text: string; reply?: AskReply };
function Ask({ id, plan }: { id: string; plan: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (mode: "ask" | "simple") => {
    const question = q.trim();
    if (!question) return;
    setError(""); setBusy(true); setQ("");
    setMsgs((m) => [...m, { role: "me", text: mode === "simple" ? `Explain simply: ${question}` : question }]);
    try {
      const r = await api<AskReply>(`/api/study/sets/${id}/ask`, jsonInit("POST", { question, mode }));
      setMsgs((m) => [...m, { role: "keplar", text: r.answer, reply: r }]);
      window.dispatchEvent(new Event("focus"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className={c.card}>
      <p className={s.note}>Answers come only from your uploaded material, with page references. If it isn&rsquo;t in the guide, Keplar says so.{plan === "free" ? " Free runs on free models." : ""}</p>
      <div className={s.chat} role="log" aria-live="polite" data-motion="stream">
        {msgs.map((m, k) => (
          <div key={k} className={s.msg} data-role={m.role}>
            <p>{m.text}</p>
            {m.reply?.found ? <p className={s.cites}>From the guide: {m.reply.citations.map((x) => `p. ${x.page}${x.section ? ` (${x.section})` : ""}`).join(" · ")}</p> : null}
            {m.reply && !m.reply.found ? <p className={s.cites}>Not found in your material.</p> : null}
          </div>
        ))}
      </div>
      {error ? <p className={c.error} role="alert">{error}</p> : null}
      <textarea className={c.input} rows={3} value={q} onChange={(e) => setQ(e.target.value)} maxLength={800} placeholder="Ask about your guide, e.g. What is the difference between mitosis and meiosis?" aria-label="Question about your guide" />
      <div className={c.submitRow}>
        <button type="button" className={c.primary} disabled={busy || !q.trim()} onClick={() => void send("ask")}>{busy ? "Reading your guide…" : "Ask the guide"}</button>
        <button type="button" className={c.ghost} disabled={busy || !q.trim()} onClick={() => void send("simple")}>Explain this simply</button>
      </div>
    </section>
  );
}

function Progress({ d }: { d: Detail }) {
  const p = d.progress;
  return (
    <div className={s.stack}>
      <section className={c.card}>
        <div className={s.stats}>
          <div><strong>{pct(p.overall)}</strong><span>overall mastery</span></div>
          <div><strong>{p.streak.current}</strong><span>day streak (best {p.streak.best})</span></div>
          <div><strong>{p.dueCards}</strong><span>cards due</span></div>
        </div>
      </section>
      <section className={c.card}>
        <h2 className={c.cardTitle}>Mastery by topic</h2>
        <ul className={s.bars}>
          {p.mastery.map((m) => (
            <li key={m.topicId}>
              <div className={s.barHead}><span>{m.name}</span><span className={s.pages}>{m.level === "new" ? "not started" : pct(m.mastery)}</span></div>
              <div className={s.track} role="meter" aria-label={`${m.name} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((m.mastery ?? 0) * 100)}><span data-level={m.level} style={{ width: `${Math.round((m.mastery ?? 0) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>
      {p.mock.length ? (
        <section className={c.card}>
          <h2 className={c.cardTitle}>Mock exams</h2>
          <ul className={s.list}>{p.mock.slice().reverse().map((m, i) => <li key={i}>{m.at}: {m.score} of {m.total} ({Math.round((m.score / Math.max(1, m.total)) * 100)}%)</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
