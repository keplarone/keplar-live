"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/kit";
import { Markdown } from "./Markdown";
import type { Outcome, OutcomeKind, RunStatus, RunView } from "@/lib/runs/types";
import { OUTCOME_ORDER } from "@/lib/runs/types";
import s from "./App.module.css";
import t from "./Tasks.module.css";

/**
 * Tasks: the Run ledger (src/lib/runs) for the signed-in person. Read only: every row, step and outcome comes from a record an
 * executor wrote. The two actions here are the executors' own (Approvals; Core's "Keep working"), never new ones.
 */

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "error"; message: string } | { kind: "ready"; runs: RunView[] };
type Tab = "approvals" | "agents" | "apps" | "thread";

const STATUS_WORD: Record<RunStatus, string> = { running: "Working", needs_you: "Needs you", done: "Done", failed: "Didn't finish", stopped: "Stopped" };
/** The word on each outcome line. It carries the meaning; the colour and glyph only repeat it. */
const KIND_WORD: Record<OutcomeKind, string> = {
  done: "Done",
  proposed: "Waiting for you",
  verified: "Checked by running it",
  reviewed: "Reviewed by another model",
  generated: "Written by a model",
  open: "Not done",
};
const KIND_SHORT: Record<OutcomeKind, string> = { done: "done", proposed: "waiting", verified: "checked", reviewed: "reviewed", generated: "written", open: "not done" };
const GLYPH: Record<OutcomeKind, string> = { done: "✓", proposed: "○", verified: "✓", reviewed: "≈", generated: "✎", open: "!" };
const POLL_MS = 15_000;

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
function ago(isoAt: string, now: number): string {
  const ms = Date.parse(isoAt);
  if (!Number.isFinite(ms) || !rtf) return "";
  const mins = Math.round((ms - now) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

function tallyText(outcomes: Outcome[]): string {
  const counts = new Map<OutcomeKind, number>();
  for (const o of outcomes) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  return OUTCOME_ORDER.filter((k) => counts.get(k)).map((k) => `${counts.get(k)} ${KIND_SHORT[k]}`).join(" · ");
}

function OutcomeLine({ o }: { o: Outcome }) {
  return (
    <li className={t.outcome} data-kind={o.kind}>
      <span className={t.badge}>
        <span className={t.glyph} aria-hidden="true">{GLYPH[o.kind]}</span>
        {KIND_WORD[o.kind]}
      </span>
      <span className={t.outcomeText}>
        {o.text}
        {o.evidence ? <span className={t.evidence}>{o.evidence}</span> : null}
      </span>
    </li>
  );
}

function RunRow({ run, now, onOpenTab, onChanged }: { run: RunView; now: number; onOpenTab: (v: Tab) => void; onChanged: () => void }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useRef(false);

  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || loaded.current || run.source !== "core" || run.status !== "done") return;
    loaded.current = true;
    fetch(`/api/runs/${encodeURIComponent(run.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RunView>) : null))
      .then((full) => setAnswer(full?.result ?? null))
      .catch(() => { loaded.current = false; });
  };

  const keepWorking = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/core/jobs/${encodeURIComponent(run.id.slice("core.".length))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keepGoing: true }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "Keplar couldn't continue this. Try again in a minute.");
      } else onChanged();
    } catch {
      setProblem("You're offline. Keplar will be able to continue once you're connected.");
    } finally {
      setBusy(false);
    }
  };

  const summary = tallyText(run.outcomes);
  const when = ago(run.updatedAt, now);
  return (
    <li className={t.row} data-status={run.status}>
      <details className={t.details} onToggle={onToggle}>
        <summary className={t.summary}>
          <span className={t.status}>
            <span className={t.statusDot} aria-hidden="true" />
            {STATUS_WORD[run.status]}
          </span>
          <span className={t.title}>{run.title}</span>
          <span className={t.meta}>
            {run.detail ? <span>{run.detail}</span> : null}
            {summary ? <span>{summary}</span> : null}
            {when ? <span>Updated <time dateTime={run.updatedAt}>{when}</time></span> : null}
          </span>
        </summary>
        <div className={t.body}>
          {run.outcomes.length ? (
            <section aria-label="Result">
              <h3 className={t.heading}>Result</h3>
              <ul className={t.outcomes}>{run.outcomes.map((o, i) => <OutcomeLine key={i} o={o} />)}</ul>
            </section>
          ) : null}
          {run.steps.length ? (
            <section aria-label="Steps">
              <h3 className={t.heading}>Steps</h3>
              <ol className={t.steps}>
                {run.steps.map((st, i) => (
                  <li key={i} data-state={st.state}>
                    <span className={t.stepMark} aria-hidden="true" />
                    <span>{st.text}</span>
                    <span className={t.srOnly}>{st.state === "done" ? " (done)" : st.state === "active" ? " (in progress)" : st.state === "failed" ? " (failed)" : st.state === "skipped" ? " (skipped)" : " (not started)"}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {answer ? (
            <section aria-label="Answer" className={t.answer}>
              <h3 className={t.heading}>Answer</h3>
              <Markdown source={answer} />
            </section>
          ) : null}
          {run.next ? (
            <div className={t.actions}>
              {run.next.keepWorking ? (
                <Button variant="primary" size="sm" loading={busy} onClick={keepWorking}>Keep working</Button>
              ) : run.next.view ? (
                <Button variant="primary" size="sm" onClick={() => onOpenTab(run.next!.view!)}>{run.next.label}</Button>
              ) : null}
              {problem ? <p className={t.problem} role="alert">{problem}</p> : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export function TasksView({ onOpenTab }: { onOpenTab: (v: Tab) => void }) {
  const [st, setSt] = useState<State>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (!live) return;
        if (res.status === 401) return setSt({ kind: "signed-out" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { runs: RunView[] };
        if (!live) return;
        setSt({ kind: "ready", runs: data.runs ?? [] });
        setNow(Date.now());
      } catch {
        if (live) setSt((prev) => (prev.kind === "ready" ? prev : { kind: "error", message: "Tasks couldn't be loaded. Check your connection and try again." }));
      }
    })();
    return () => { live = false; };
  }, [reload]);

  // Something is still running: refresh while the tab is visible, so a stalled list never looks current.
  const running = st.kind === "ready" && st.runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [running, load]);

  const needYou = st.kind === "ready" ? st.runs.filter((r) => r.status === "needs_you").length : 0;
  const working = st.kind === "ready" ? st.runs.filter((r) => r.status === "running").length : 0;
  const status = [needYou ? `${needYou} ${needYou === 1 ? "needs" : "need"} you` : "", working ? `${working} working` : ""].filter(Boolean).join(" · ");

  return (
    <div className={s.view} data-tasks="">
      <header className={s.viewHead}>
        <div>
          <h1 className={s.viewTitle}>Tasks</h1>
          <p className={s.viewLede}>What Keplar is working on, what it finished, and what still needs you. Every result says how it was checked.</p>
        </div>
        {st.kind === "ready" ? <Button variant="secondary" size="sm" onClick={() => load()}>Refresh</Button> : null}
      </header>
      {status ? <p className={t.headline} role="status">{status}</p> : null}
      {st.kind === "loading" ? <p className={s.viewEmpty} role="status">Loading tasks…</p> : null}
      {st.kind === "error" ? (
        <div className={s.viewEmpty} role="alert">
          <p>{st.message}</p>
          <Button variant="secondary" size="sm" onClick={() => load()}>Try again</Button>
        </div>
      ) : null}
      {st.kind === "signed-out" ? (
        <div className={s.viewEmpty}>
          <p>Sign in to see your tasks. Thorough answers that keep working, agent runs and actions in connected apps show up here.</p>
          <Link className={t.link} href="/signin?next=%2Fapp%2Ftasks">Sign in</Link>
        </div>
      ) : null}
      {st.kind === "ready" && !st.runs.length ? (
        <div className={s.viewEmpty}>
          <p>No tasks yet. When Keplar works on something longer, such as a Thorough answer, an agent run or an action in a connected app, it shows up here with what was done and what still needs you.</p>
          <Button variant="secondary" size="sm" onClick={() => onOpenTab("thread")}>Ask Keplar</Button>
        </div>
      ) : null}
      {st.kind === "ready" && st.runs.length ? (
        <ul className={t.list} aria-label="Tasks">
          {st.runs.map((r) => <RunRow key={r.id} run={r} now={now} onOpenTab={onOpenTab} onChanged={() => load()} />)}
        </ul>
      ) : null}
    </div>
  );
}
