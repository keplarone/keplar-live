"use client";
/**
 * An errand in the chat ("order a pizza", "book a hotel in Rome"): Keplar works through it in its own browser on Keplar's
 * servers (/api/browser/tasks) while the card shows each real step, and hands over before paying, sending or signing in.
 * Nothing starts until the person presses Start; "Just answer" turns it into a normal answer instead.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { ERRAND_PLAN, errandStages, handoverUrl, hostOf, type ErrandTask } from "@/lib/browser/errand-view";
import type { ErrandCard, KeplarMessage } from "../state/types";
import { TaskTimeline } from "./TaskTimeline";
import s from "./ErrandTurn.module.css";

const POLL_MS = 2000;

type Props = {
  message: KeplarMessage;
  isLast: boolean;
  onPatch: (patch: Partial<ErrandCard>) => void;
  /** Answer the goal normally instead (a plain Keplar answer). */
  onAnswer: (text: string) => void;
};

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
    if (r.status === 401) return { ok: false, error: "Sign in so Keplar can do this for you.", status: 401 };
    if (!r.ok || !j) return { ok: false, error: j?.error ?? "Keplar's browser couldn't be reached. Nothing was opened.", status: r.status };
    return { ok: true, data: j };
  } catch {
    return { ok: false, error: "Keplar's browser couldn't be reached. Check your connection and try again.", status: 0 };
  }
}

export function ErrandTurn({ message, isLast, onPatch, onAnswer }: Props) {
  const e = message.errand!;
  const plan = ERRAND_PLAN[e.kind];
  const [task, setTask] = useState<ErrandTask | null>(null);
  const [stopping, setStopping] = useState(false);

  const start = useCallback(async () => {
    onPatch({ phase: "starting", error: undefined, signin: undefined });
    const r = await api<{ task: ErrandTask }>("/api/browser/tasks", { method: "POST", body: JSON.stringify({ goal: e.goal }) });
    if (!r.ok) return onPatch({ phase: "failed", error: r.error, ...(r.status === 401 ? { signin: true } : {}) });
    setTask(r.data.task);
    onPatch({ phase: "started", taskId: r.data.task.id });
  }, [e.goal, onPatch]);

  // Follow the task while it runs (and pick it back up after a reload).
  useEffect(() => {
    if (e.phase !== "started" || !e.taskId) return;
    let live = true;
    let timer = 0;
    const tick = async () => {
      const r = await api<{ task: ErrandTask }>(`/api/browser/tasks/${e.taskId}`);
      if (!live) return;
      if (r.ok) {
        setTask(r.data.task);
        if (r.data.task.status !== "running") return;
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { live = false; window.clearTimeout(timer); };
  }, [e.phase, e.taskId]);

  async function stop() {
    if (!e.taskId) return;
    setStopping(true);
    await api(`/api/browser/tasks/${e.taskId}`, { method: "POST", body: JSON.stringify({ stop: true }) });
    setStopping(false);
  }

  const running = task?.status === "running";
  const shot = task ? [...task.steps].reverse().find((x) => x.shot) : undefined;
  const takeOver = task?.status === "needs_you" ? handoverUrl(task) : null;

  return (
    <section className={`${s.card} k-enter`} aria-label={plan.title} aria-busy={running || e.phase === "starting" || undefined}>
      <header className={s.head}>
        <KeplarSymbol size={16} />
        <h3 className={s.title}>{plan.title}</h3>
      </header>
      <p className={s.goal}>{e.goal}</p>

      {e.phase === "ready" || e.phase === "starting" || e.phase === "failed" ? (
        <>
          <ul className={s.promise}>
            <li>{plan.does}</li>
            <li>{plan.handsOver}</li>
            <li>It uses its own private browser, signed out, so your accounts and cards are never touched.</li>
          </ul>
          {e.error ? <p className={s.error} role="alert">{e.error}</p> : null}
          <div className={s.actions}>
            {e.signin ? <Link className="k3d k3d-primary" href="/signin?next=/app">Sign in</Link> : null}
            <button type="button" className={e.signin ? "k3d" : "k3d k3d-primary"} onClick={() => void start()} disabled={e.phase === "starting" || !isLast}>
              {e.phase === "starting" ? "Starting…" : e.phase === "failed" ? "Try again" : "Start"}
            </button>
            <button type="button" className="k3d" onClick={() => { onPatch({ phase: "declined" }); onAnswer(e.goal); }} disabled={e.phase === "starting" || !isLast}>
              Just answer
            </button>
          </div>
        </>
      ) : null}

      {e.phase === "declined" ? <p className={s.note}>Answered normally instead.</p> : null}

      {e.phase === "started" ? (
        task ? (
          <div className={s.run}>
            <TaskTimeline stages={errandStages(task)} label="What Keplar did" />
            {shot?.shot ? (
              <figure className={s.view}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: screenshot from this task */}
                <img src={shot.shot} alt={`What Keplar's browser shows on ${hostOf(shot.url)}`} />
                <figcaption>{hostOf(shot.url)}</figcaption>
              </figure>
            ) : null}
            <div className={s.actions} aria-live="polite">
              {running ? <button type="button" className="k3d" onClick={() => void stop()} disabled={stopping}>{stopping ? "Stopping…" : "Stop"}</button> : null}
              {takeOver ? <a className="k3d k3d-primary" href={takeOver} target="_blank" rel="noopener noreferrer">Open the page and finish</a> : null}
              {task.status === "failed" || task.status === "interrupted" || task.status === "stopped" ? <button type="button" className="k3d" onClick={() => void start()}>Try again</button> : null}
            </div>
          </div>
        ) : (
          <p className={s.note} role="status">Opening Keplar&apos;s browser…</p>
        )
      ) : null}
    </section>
  );
}
