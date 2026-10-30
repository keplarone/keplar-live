"use client";
/**
 * Computer use in the Keplar Business workspace. It runs only in the Keplar Business desktop app (0.1.8+), which exposes
 * window.keplarComputer on this page; in a browser it says so and offers the app, never a simulation.
 *
 * The loop: the app captures the screen -> /api/business/computer/step proposes one action -> the app checks it again, asks
 * the person on its always-on-top bar (always for anything that spends, sends, deletes, submits or signs in) and performs it.
 * The app minimises this window while it works and brings it back when the run ends. Stop: the bar, Ctrl+Shift+X, or here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./workspace.module.css";
import c from "./computer.module.css";

type Res<T> = { ok: true; result: T } | { ok: false; error: string; code: string };
type Status = { version: number; platform: string; supported: boolean; reason: string | null; permissions: { accessibility: boolean; screen: boolean }; active: boolean; limits: { steps: number; minutes: number }; stopKey: string };
type Step = { action: { type: string; [k: string]: unknown }; say: string; sensitive: boolean };
type Bridge = {
  version: number;
  status(): Promise<Res<Status>>;
  start(goal: string, opts?: { askEach?: boolean }): Promise<Res<{ goal: string; askEach: boolean }>>;
  capture(): Promise<Res<{ shot: string; width: number; height: number }>>;
  perform(step: Step): Promise<Res<{ decision: string; ok?: boolean; note?: string | null }>>;
  stop(): Promise<Res<null>>;
  onEvent(listener: (e: { state: string; reason?: string; answer?: string; say?: string; step?: number }) => void): () => void;
};
type Log = { id: number; text: string; tone?: "ok" | "warn" | "muted" };

const bridge = (): Bridge | null => (typeof window === "undefined" ? null : ((window as unknown as { keplarComputer?: Bridge }).keplarComputer ?? null));
const EXAMPLES = ["Open my Downloads folder and sort it by date", "In the open spreadsheet, add a total row under the last column", "Find the latest invoice PDF in Downloads and open it"];

export function Computer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [b] = useState(bridge);
  const [status, setStatus] = useState<Status | null>(null);
  const [goal, setGoal] = useState("");
  const [askEach, setAskEach] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const [error, setError] = useState("");
  const stopped = useRef(false);
  const n = useRef(0);
  const add = useCallback((text: string, tone?: Log["tone"]) => setLog((l) => [...l, { id: ++n.current, text, tone }].slice(-80)), []);

  useEffect(() => {
    if (!b) return;
    void b.status().then((r) => { if (r.ok) setStatus(r.result); else setError(r.error); });
    return b.onEvent((e) => {
      if (e.state === "asking") add(`Waiting for your approval: ${e.say}`, "warn");
      if (e.state === "done") { stopped.current = true; setRunning(false); add(e.answer ? `Done. ${e.answer}` : "Done.", "ok"); }
      if (e.state === "stopped" || e.state === "failed") { stopped.current = true; setRunning(false); add(e.reason ?? "Stopped.", "muted"); }
    });
  }, [b, add]);

  const run = async () => {
    if (!b || goal.trim().length < 4) return;
    setError("");
    setLog([]);
    stopped.current = false;
    const started = await b.start(goal.trim(), { askEach });
    if (!started.ok) { setError(started.error); return; }
    setRunning(true);
    add(`Goal: ${goal.trim()}`);
    const history: { say: string; type: string; ok: boolean; note?: string }[] = [];
    while (!stopped.current) {
      const shot = await b.capture();
      if (!shot.ok) { if (!stopped.current) { add(shot.error, "warn"); await b.stop(); } break; }
      let step: Step;
      try {
        const r = await fetch("/api/business/computer/step", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ goal: goal.trim(), history, screen: { width: shot.result.width, height: shot.result.height }, shot: shot.result.shot }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { add((d as { error?: string }).error ?? "Keplar couldn't decide the next step.", "warn"); await b.stop(); break; }
        step = (d as { step: Step }).step;
      } catch {
        add("The connection dropped, so Keplar stopped.", "warn");
        await b.stop();
        break;
      }
      if (stopped.current) break;
      if (step.action.type !== "done" && step.action.type !== "stop") add(step.say);
      const done = await b.perform(step);
      if (!done.ok) { add(done.error, "warn"); break; }
      const res = done.result;
      if (res.decision === "done" || res.decision === "stopped") break;
      history.push({ say: res.decision === "skipped" ? `Skipped by the person: ${step.say}` : step.say, type: step.action.type, ok: res.decision === "skipped" || res.ok !== false, ...(res.note ? { note: res.note } : {}) });
      if (res.ok === false) add(`That step didn't work: ${res.note ?? "unknown error"}`, "warn");
    }
    setRunning(false);
  };

  if (!b) {
    return (
      <div className={s.page}>
        <header className={s.head}><div><h1 className={s.h1}>Computer use</h1><p className={s.muted}>Keplar operates apps on your computer for you, one approved step at a time.</p></div></header>
        <div className={c.card}>
          <h2 className={c.cardTitle}>Runs in the Keplar Business desktop app</h2>
          <p className={s.muted}>A web page can&apos;t control your computer, so computer use needs the desktop app for Windows, macOS or Linux (version 0.1.8 or later). In a browser you can still share your screen with Keplar from the composer.</p>
          <div className={s.row}><button type="button" className={s.btnPrimary} data-orbit-fx="primary" onClick={onOpenSettings}>Get the desktop app</button></div>
        </div>
        <How />
      </div>
    );
  }

  const blocked = status && (!status.supported || (status.platform === "darwin" && (!status.permissions.accessibility || !status.permissions.screen)));
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div><h1 className={s.h1}>Computer use</h1><p className={s.muted}>Tell Keplar what to do. It works on your screen one step at a time and asks before anything that spends, sends, deletes or signs in.</p></div>
      </header>
      {status && !status.supported ? <p className={c.warn} role="alert">{status.reason}</p> : null}
      {status?.platform === "darwin" && status.supported && (!status.permissions.accessibility || !status.permissions.screen) ? (
        <p className={c.warn} role="status">macOS asks for two permissions the first time: Screen Recording (to see your screen) and Accessibility (to use the mouse and keyboard). Press Start and allow Keplar Business in System Settings › Privacy &amp; Security.</p>
      ) : null}
      <form className={c.card} onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label htmlFor="computer-goal" className={c.label}>What should Keplar do?</label>
        <textarea id="computer-goal" className={c.goal} rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={EXAMPLES[0]} disabled={running} maxLength={600} />
        <div className={c.examples}>{EXAMPLES.map((x) => <button key={x} type="button" className={c.example} onClick={() => setGoal(x)} disabled={running}>{x}</button>)}</div>
        <div className={c.controls}>
          <label className={c.check}><input type="checkbox" checked={askEach} onChange={(e) => setAskEach(e.target.checked)} disabled={running} /> Ask before each step</label>
          <span className={c.grow} />
          {running ? <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => { stopped.current = true; void b.stop(); }}>Stop</button>
            : <button type="submit" className={s.btnPrimary} data-orbit-fx="primary" disabled={goal.trim().length < 4 || Boolean(blocked && status?.platform !== "darwin")}>Start</button>}
        </div>
        <p className={s.muted}>{askEach ? "You approve every step on the bar at the top of your screen." : "Steps run on their own, except anything that spends, sends, deletes, submits or signs in: those always wait for you."} Stop any time with {status?.stopKey ?? "Ctrl+Shift+X"} or the bar&apos;s Stop. Up to {status?.limits.steps ?? 40} steps or {status?.limits.minutes ?? 15} minutes per run. Keplar never types passwords or card numbers.</p>
      </form>
      {error ? <p className={c.warn} role="alert">{error}</p> : null}
      {log.length ? (
        <section className={c.card} aria-label="What Keplar did">
          <h2 className={c.cardTitle}>{running ? "Working" : "Last run"}</h2>
          <ol className={c.log}>{log.map((l) => <li key={l.id} data-tone={l.tone}>{l.text}</li>)}</ol>
        </section>
      ) : <How />}
    </div>
  );
}

function How() {
  return (
    <ol className={c.how}>
      <li><strong>Looks</strong><span>The app takes a screenshot of your main screen. It is used for that one step and never stored.</span></li>
      <li><strong>Proposes</strong><span>Keplar picks one action: a click, a few words to type, a key or a scroll.</span></li>
      <li><strong>Asks</strong><span>The bar at the top shows it. You approve, skip or stop. Spending, sending, deleting and signing in always ask.</span></li>
      <li><strong>Acts</strong><span>Only then is the mouse or keyboard used, and Keplar looks again.</span></li>
    </ol>
  );
}
