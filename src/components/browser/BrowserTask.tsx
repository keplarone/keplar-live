"use client";
/**
 * Keplar Browser: give Keplar a task and watch it work in its own isolated browser, step by step with the newest screenshot.
 * The task runs on Keplar's servers, so this tab can be closed; recent tasks are listed here to come back to. Stop any time.
 * It only opens public websites and hands anything that spends, sends, deletes or signs in back to you.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./BrowserTask.module.css";

type Step = { n: number; note: string; url: string; title: string; shot?: string };
type Status = "running" | "done" | "needs_you" | "failed" | "stopped" | "interrupted";
type Task = { id: string; goal: string; url?: string; status: Status; steps: Step[]; answer?: string; reason?: string; createdAt: string };

const HEAD: Record<Status, string> = { running: "Working", done: "Done", needs_you: "Over to you", failed: "Didn't finish", stopped: "Stopped", interrupted: "Interrupted" };
const POLL_MS = 2000;

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
    if (r.status === 401) return { ok: false, error: "Sign in to use Keplar Browser." };
    if (!r.ok || !j) return { ok: false, error: j?.error ?? "Keplar Browser couldn't be reached." };
    return { ok: true, data: j };
  } catch {
    return { ok: false, error: "Keplar Browser couldn't be reached." };
  }
}

export function BrowserTask() {
  const [goal, setGoal] = useState("");
  const [url, setUrl] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [current, setCurrent] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const applyList = useCallback((list: Task[]) => {
    setTasks(list);
    setCurrent((c) => c ?? list.find((t) => t.status === "running") ?? null);
  }, []);
  const refreshList = useCallback(() => api<{ tasks: Task[] }>("/api/browser/tasks").then((r) => { if (r.ok) applyList(r.data.tasks); }), [applyList]);

  // Coming back to the page picks up a task that is still running.
  useEffect(() => {
    let live = true;
    void api<{ tasks: Task[] }>("/api/browser/tasks").then((r) => { if (live && r.ok) applyList(r.data.tasks); });
    return () => { live = false; };
  }, [applyList]);

  // Follow the task on screen while it runs.
  useEffect(() => {
    if (!current || current.status !== "running") return;
    timer.current = window.setTimeout(async () => {
      const r = await api<{ task: Task }>(`/api/browser/tasks/${current.id}`);
      if (r.ok) {
        setCurrent(r.data.task);
        if (r.data.task.status !== "running") void refreshList();
      }
    }, POLL_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [current, refreshList]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (starting || goal.trim().length < 4) return;
    setError(null);
    setStarting(true);
    const r = await api<{ task: Task }>("/api/browser/tasks", { method: "POST", body: JSON.stringify({ goal, url: url.trim() || undefined }) });
    setStarting(false);
    if (!r.ok) return setError(r.error);
    setCurrent(r.data.task);
    setOpen(null);
    void refreshList();
  }

  async function stop() {
    if (!current) return;
    const r = await api<{ task: Task }>(`/api/browser/tasks/${current.id}`, { method: "POST", body: JSON.stringify({ stop: true }) });
    if (!r.ok) setError(r.error);
  }

  const running = current?.status === "running";
  const steps = current?.steps ?? [];
  const shown = steps.find((x) => x.n === open) ?? steps[steps.length - 1];
  const latestShot = [...steps].reverse().find((x) => x.shot)?.shot;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>Keplar Browser</h1>
        <p className={s.lede}>Keplar works in its own private browser on Keplar&apos;s servers. You can watch, stop it, or close this tab and come back. It opens public websites only, starts signed out every time, and stops before buying, sending, deleting or signing in.</p>
      </header>

      <form className={s.form} onSubmit={start}>
        <label className={s.label} htmlFor="kb-goal">Task</label>
        <textarea id="kb-goal" className={s.goal} rows={2} maxLength={600} placeholder="Find the opening hours of the Science Museum in London" value={goal} onChange={(e) => setGoal(e.target.value)} disabled={starting} />
        <label className={s.label} htmlFor="kb-url">Start at (optional)</label>
        <input id="kb-url" className={s.url} type="url" inputMode="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={starting} />
        <div className={s.actions}>
          <button type="submit" className={s.go} disabled={starting || running || goal.trim().length < 4}>{starting ? "Starting…" : "Start"}</button>
          {running ? <button type="button" className={s.stop} onClick={() => void stop()}>Stop</button> : null}
          {running ? <span className={s.live} role="status"><span className={s.dot} aria-hidden="true" />Working{steps.length ? `: step ${steps.length}` : "…"}</span> : null}
        </div>
      </form>

      {error ? <p className={s.error} role="alert">{error}</p> : null}

      {current ? (
        <>
          {current.status !== "running" ? (
            <section className={s.outcome} data-status={current.status} aria-live="polite">
              <h2 className={s.outHead}>{HEAD[current.status]}</h2>
              <p className={s.task}>{current.goal}</p>
              {current.answer ? <p className={s.answer}>{current.answer}</p> : null}
              {current.reason ? <p className={s.reason}>{current.reason}</p> : null}
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data: screenshot from this task */}
                  {shown.shot ? <img className={s.shot} src={shown.shot} alt={`Screenshot after step ${shown.n + 1}: ${shown.title || shown.url}`} /> : latestShot && shown.n !== steps[steps.length - 1].n ? <p className={s.noShot}>Only the newest screenshot is kept. This step went to {shown.url}.</p> : <p className={s.noShot}>No screenshot for this step.</p>}
                </figure>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {tasks.length ? (
        <section className={s.history} aria-label="Recent tasks">
          <h2 className={s.histHead}>Recent tasks</h2>
          <ul className={s.histList}>
            {tasks.map((t) => (
              <li key={t.id}>
                <button type="button" className={s.histItem} aria-current={current?.id === t.id ? "true" : undefined} onClick={() => { setCurrent(t); setOpen(null); }}>
                  <span className={s.histGoal}>{t.goal}</span>
                  <span className={s.histMeta} data-status={t.status}>{HEAD[t.status]} · {new Date(t.createdAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
