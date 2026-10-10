"use client";
/**
 * Home-page live demo: a real question through the real pipeline (/api/keplar, anonymous Free: free models only, server-side
 * daily limits), with the stages, the models answering, the disagreement and the answer streaming in. No account. A small
 * client allowance on top (demo-limits.ts); the server's own limits are the real guard and their message is shown as is.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { streamKeplar, StreamHttpError } from "@/components/app-ui/state/stream";
import { DEMO_DAILY_LIMIT, DEMO_MAX_PROMPT_CHARS, DEMO_STORAGE_KEY, demoCheck, type DemoLedger } from "@/lib/demo-limits";
import type { KeplarAnswer, StageId } from "@/lib/orchestration/types";
import { useClientText, useLocale } from "@/lib/i18n/client";
import { localizedPath } from "@/lib/i18n/routing";
import { fmt } from "@/lib/i18n/format";
import s from "./LiveDemo.module.css";

const SAMPLES = [
  "Is it cheaper to run a heat pump or a gas boiler in a cold winter?",
  "Should a two-person startup incorporate in Delaware?",
  "Does creatine help with memory, or only muscles?",
];
const STAGES: { id: StageId; label: string }[] = [
  { id: "understand", label: "Understanding the question" },
  { id: "select", label: "Choosing which models to ask" },
  { id: "compare", label: "Comparing their answers" },
  { id: "disagree", label: "Finding disagreements" },
  { id: "verify", label: "Checking what holds up" },
  { id: "synthesize", label: "Writing one answer" },
];
type StageState = "idle" | "active" | "done";
type ModelRow = { id: string; name: string; status: "responded" | "failed" | "refused" };

function readLedger(): DemoLedger | null {
  try { return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? "null") as DemoLedger | null; } catch { return null; }
}
const noSubscribe = () => () => {};
function readLedgerRaw(): string {
  try { return localStorage.getItem(DEMO_STORAGE_KEY) ?? ""; } catch { return ""; }
}
function remaining(raw: string): number {
  let l: DemoLedger | null = null;
  try { l = raw ? (JSON.parse(raw) as DemoLedger) : null; } catch { l = null; }
  const r = demoCheck(l, Date.now());
  return r.ok ? r.left + 1 : r.left;
}
/** Light markdown to plain paragraphs: the demo shows prose, the app shows the full card. */
const plain = (md: string) => md.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^\s*[-*]\s+/gm, "· ");

export function LiveDemo() {
  const t = useClientText().demo;
  const locale = useLocale();
  const label = (x: { id: string; label: string }) => t.stages[x.id] ?? x.label;
  const [q, setQ] = useState("");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [models, setModels] = useState<ModelRow[]>([]);
  const [dis, setDis] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<KeplarAnswer | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const stored = useSyncExternalStore(noSubscribe, readLedgerRaw, () => null);
  const [leftAfter, setLeft] = useState<number | null>(null);
  const left = leftAfter ?? (stored === null ? null : remaining(stored));
  const [asked, setAsked] = useState("");
  const abort = useRef<AbortController | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (raw: string) => {
    const prompt = raw.trim().slice(0, DEMO_MAX_PROMPT_CHARS);
    if (!prompt || running) return;
    const gate = demoCheck(readLedger(), Date.now());
    if (!gate.ok) {
      setMsg(gate.reason === "daily" ? fmt(t.dailyDemo, { n: DEMO_DAILY_LIMIT }) : t.slowDown);
      return;
    }
    try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(gate.next)); } catch { /* private mode: the server limits still apply */ }
    setLeft(gate.left);
    setAsked(prompt); setRunning(true); setStages({}); setModels([]); setDis(null); setText(""); setAnswer(null); setMsg(null);
    const ac = new AbortController();
    abort.current = ac;
    try {
      for await (const ev of streamKeplar({ prompt, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, ac.signal)) {
        if (ev.type === "stage") setStages((m) => ({ ...m, [ev.stage]: ev.status }));
        else if (ev.type === "model") setModels((m) => [...m.filter((x) => x.id !== ev.modelId), { id: ev.modelId, name: ev.name, status: ev.status }]);
        else if (ev.type === "disagreement") setDis(ev.summary);
        else if (ev.type === "delta") setText((t) => t + ev.text);
        else if (ev.type === "answer") { setAnswer(ev.answer); setText(ev.answer.markdown); setStages((m) => Object.fromEntries(STAGES.map((x) => [x.id, m[x.id] ? "done" : "idle"]))); }
        else if (ev.type === "limit") setMsg(ev.daily ? t.dailyFree : t.tooBig);
        else if (ev.type === "error") setMsg(ev.message);
      }
    } catch (e) {
      if (!ac.signal.aborted) setMsg(e instanceof StreamHttpError ? e.message : t.offline);
    } finally {
      setRunning(false);
    }
  };

  const started = running || text || answer || msg;
  const c = answer?.consensus;
  return (
    <div className={s.demo}>
      <form className={s.ask} onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <label htmlFor="demo-q" className={s.label}>{t.label}</label>
        <textarea ref={field} id="demo-q" className={`${s.input} type-input`} rows={3} maxLength={DEMO_MAX_PROMPT_CHARS} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.placeholder} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
        <div className={s.row}>
          <button type="submit" className={s.go} disabled={running || !q.trim()}>{running ? t.asking : t.ask}</button>
          <span className={s.meta}>{left === null ? "" : fmt(t.left, { left, n: DEMO_DAILY_LIMIT })} · {t.metaTail}</span>
        </div>
        <ul className={s.samples} aria-label={t.examples}>
          {(t.samples.length === SAMPLES.length ? t.samples : SAMPLES).map((x) => <li key={x}><button type="button" disabled={running} onClick={() => { setQ(x); void ask(x); }}>{x}</button></li>)}
        </ul>
      </form>

      <div className={s.out} aria-live="polite" data-on={started ? "" : undefined}>
        {!started ? (
          <div className={s.idle}>
            <p className={s.idleHead}>{t.idleHead}</p>
            <ol className={s.stages}>{STAGES.map((x) => <li key={x.id}><i />{label(x)}</li>)}</ol>
          </div>
        ) : (
          <>
            <p className={s.q}>{asked}</p>
            <ol className={s.stages}>
              {STAGES.map((x) => <li key={x.id} data-s={stages[x.id] ?? "idle"}><i />{label(x)}</li>)}
            </ol>
            {models.length ? (
              <ul className={s.models} aria-label={t.models}>{models.map((m) => <li key={m.id} data-s={m.status}>{m.name}<span>{m.status === "responded" ? t.answered : m.status}</span></li>)}</ul>
            ) : null}
            {dis ? <p className={s.dis}><b>{t.disagreement}</b>{dis}</p> : null}
            {text ? <div className={s.answer}>{plain(text).split(/\n{2,}/).slice(0, 8).map((p, i) => <p key={i}>{p}</p>)}{running ? <span className={s.caret} aria-hidden="true" /> : null}</div> : null}
            {c && !answer?.smalltalk ? <p className={s.consensus}>{fmt(t.consensus, { responded: c.responded, consulted: c.consulted, agree: c.agree })}{c.disagree ? fmt(t.disagreeCount, { n: c.disagree }) : ""}{c.summary ? ` · ${c.summary}` : ""}</p> : null}
            {msg ? <p className={s.msg}>{msg}</p> : null}
            {answer || msg ? (
              <div className={s.next}>
                <a className={s.go} href={`/app/ask#q=${encodeURIComponent(asked)}`}>{t.fullCard}</a>
                <Link className={s.link} href={localizedPath("/signup?utm_source=home_demo", locale)}>{t.signup}</Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
