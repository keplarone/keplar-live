"use client";
/**
 * Keplar Browser: give Keplar a task, watch it work in its own isolated browser step by step (each with a screenshot),
 * stop it any time. It only opens public websites and hands anything that spends, sends, deletes or signs in back to you.
 */
import { useRef, useState } from "react";
import s from "./BrowserTask.module.css";

type Step = { n: number; note: string; url: string; title: string; shot?: string };
type Outcome = { status: "done" | "needs_you" | "failed" | "stopped"; answer?: string; reason?: string; steps: number };

const HEAD: Record<Outcome["status"], string> = { done: "Done", needs_you: "Over to you", failed: "Didn't finish", stopped: "Stopped" };

export function BrowserTask() {
  const [goal, setGoal] = useState("");
  const [url, setUrl] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const ctl = useRef<AbortController | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (running || goal.trim().length < 4) return;
    setSteps([]);
    setOutcome(null);
    setError(null);
    setOpen(null);
    setRunning(true);
    const ac = new AbortController();
    ctl.current = ac;
    try {
      const r = await fetch("/api/browser/run", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal, url: url.trim() || undefined }), signal: ac.signal });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(r.status === 401 ? "Sign in to use Keplar Browser." : j?.error ?? "Keplar Browser couldn't start.");
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line) as { type: string; step?: Step; outcome?: Outcome; error?: string };
          if (m.type === "step" && m.step) {
            const st = m.step;
            setSteps((x) => [...x, st]);
            setOpen(st.n);
          } else if (m.type === "end" && m.outcome) setOutcome(m.outcome);
          else if (m.type === "error") setError(m.error ?? "The task didn't finish.");
        }
      }
    } catch {
      if (ac.signal.aborted) setOutcome((o) => o ?? { status: "stopped", reason: "You stopped the task. The browser was closed.", steps: 0 });
      else setError("The connection dropped. Nothing was bought, sent or changed.");
    } finally {
      setRunning(false);
      ctl.current = null;
    }
  }

  const shown = steps.find((x) => x.n === open) ?? steps[steps.length - 1];

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>Keplar Browser</h1>
        <p className={s.lede}>Keplar works in its own private browser while you watch. It opens public websites only, starts signed out every time, and stops before buying, sending, deleting or signing in.</p>
      </header>

      <form className={s.form} onSubmit={run}>
        <label className={s.label} htmlFor="kb-goal">Task</label>
        <textarea id="kb-goal" className={s.goal} rows={2} maxLength={600} placeholder="Find the opening hours of the Science Museum in London" value={goal} onChange={(e) => setGoal(e.target.value)} disabled={running} />
        <label className={s.label} htmlFor="kb-url">Start at (optional)</label>
        <input id="kb-url" className={s.url} type="url" inputMode="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={running} />
        <div className={s.actions}>
          {running ? (
            <button type="button" className={s.stop} onClick={() => ctl.current?.abort()}>Stop</button>
          ) : (
            <button type="submit" className={s.go} disabled={goal.trim().length < 4}>Start</button>
          )}
          {running ? <span className={s.live} role="status"><span className={s.dot} aria-hidden="true" />Working{steps.length ? `: step ${steps.length}` : "…"}</span> : null}
        </div>
      </form>

      {error ? <p className={s.error} role="alert">{error}</p> : null}

      {outcome ? (
        <section className={s.outcome} data-status={outcome.status} aria-live="polite">
          <h2 className={s.outHead}>{HEAD[outcome.status]}</h2>
          {outcome.answer ? <p className={s.answer}>{outcome.answer}</p> : null}
          {outcome.reason ? <p className={s.reason}>{outcome.reason}</p> : null}
        </section>
      ) : null}

      {steps.length ? (
        <section className={s.run} aria-label="Steps">
          <ol className={s.steps}>
            {steps.map((st) => (
              <li key={st.n}>
                <button type="button" className={s.step} aria-current={shown?.n === st.n ? "step" : undefined} onClick={() => setOpen(st.n)}>
                  <span className={s.n}>{st.n + 1}</span>
                  <span className={s.note}>{st.note}</span>
                  <span className={s.addr}>{st.url}</span>
                </button>
              </li>
            ))}
          </ol>
          {shown ? (
            <figure className={s.view}>
              <figcaption className={s.bar}><span className={s.barUrl}>{shown.url}</span></figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: screenshot from this run */}
              {shown.shot ? <img className={s.shot} src={shown.shot} alt={`Screenshot after step ${shown.n + 1}: ${shown.title || shown.url}`} /> : <p className={s.noShot}>No screenshot for this step.</p>}
            </figure>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
