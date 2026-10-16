/**
 * One task's progress as a vertical timeline: what Keplar did, what it is doing, and what waits for the person.
 * Every stage comes from real events (never an invented percentage). Reused by errands; builder and agent runs can map their
 * own events onto the same stages.
 */
import s from "./TaskTimeline.module.css";

export type StageStatus = "pending" | "running" | "waiting" | "needs_you" | "done" | "failed" | "canceled" | "skipped";
export type Stage = { id: string; label: string; detail?: string; status: StageStatus };

/** What a screen reader hears for each status (the icon carries it visually). */
const SAY: Record<StageStatus, string> = { pending: "Not started", running: "In progress", waiting: "Waiting", needs_you: "Needs you", done: "Done", failed: "Failed", canceled: "Canceled", skipped: "Skipped" };

function Mark({ status }: { status: StageStatus }) {
  if (status === "done")
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8.5 2.6 2.6L12 5.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (status === "failed")
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  if (status === "needs_you")
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="8" cy="11.8" r="1.1" fill="currentColor" /></svg>;
  if (status === "canceled" || status === "skipped")
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 8h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  return null;
}

export function TaskTimeline({ stages, label = "Progress" }: { stages: Stage[]; label?: string }) {
  return (
    <ol className={s.list} aria-label={label}>
      {stages.map((st, i) => (
        <li key={st.id} className={`${s.item} k-enter-side`} data-status={st.status} style={{ ["--i" as string]: Math.min(i, 8) }} aria-current={st.status === "running" ? "step" : undefined}>
          <span className={s.mark}>
            <Mark status={st.status} />
          </span>
          <span className={s.text}>
            <span className={s.label}>
              {st.label}
              <span className="visually-hidden">: {SAY[st.status]}</span>
            </span>
            {st.detail ? <span className={s.detail}>{st.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
