"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { buildPlan } from "@/lib/free-tools/plan";
import type { Tool } from "@/lib/free-tools/registry";
import s from "./tools.module.css";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return localDay(d); };
const KIND = { learn: "First study", review: "Review", final: "Final review" } as const;

/** Study plan generator: computed in the browser from the inputs; today is read after mount so server and client HTML match. */
export function PlanTool({ tool }: { tool: Tool }) {
  const id = useId();
  // Today is a client-only value (local time zone): null in the server HTML, read once the component is on the client.
  const today = useSyncExternalStore(() => () => {}, () => localDay(), () => null);
  const [v, setV] = useState<Record<string, string>>({ topics: "", exam: "", hours: "6", days: "6" });
  const exam = v.exam || (today ? plusDays(today, 21) : "");
  const set = (k: string, val: string) => setV((c) => ({ ...c, [k]: val }));
  const plan = useMemo(() => (today && v.topics.trim() && exam ? buildPlan({ topics: v.topics, exam, hoursPerWeek: Number(v.hours), daysPerWeek: Number(v.days), today }) : null), [v, exam, today]);
  const field = (fid: string) => tool.fields.find((f) => f.id === fid)!;
  return (
    <div>
      <form className={s.form} onSubmit={(e) => e.preventDefault()}>
        <div className={s.field}>
          <label htmlFor={`${id}-topics`}>{field("topics").label}</label>
          <textarea id={`${id}-topics`} rows={6} maxLength={2000} placeholder={field("topics").placeholder} value={v.topics} onChange={(e) => set("topics", e.target.value)} />
        </div>
        <div className={s.row}>
          <div className={s.field}><label htmlFor={`${id}-exam`}>{field("exam").label}</label><input id={`${id}-exam`} type="date" value={exam} min={today ?? undefined} onChange={(e) => set("exam", e.target.value)} /></div>
          <div className={s.field}><label htmlFor={`${id}-hours`}>{field("hours").label}</label><input id={`${id}-hours`} type="number" min={1} max={80} value={v.hours} onChange={(e) => set("hours", e.target.value)} /></div>
          <div className={s.field}><label htmlFor={`${id}-days`}>{field("days").label}</label><select id={`${id}-days`} value={v.days} onChange={(e) => set("days", e.target.value)}>{field("days").options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        </div>
        <ul className={s.examples} aria-label="Examples to try">
          {tool.examples.map((ex) => <li key={ex.title}><button type="button" className={s.chip} onClick={() => setV((c) => ({ ...c, ...ex.input, exam: "" }))}>Try: {ex.title}</button></li>)}
        </ul>
        <p className={s.note}>Computed in your browser. Nothing you type is sent anywhere.</p>
      </form>
      {plan && !plan.ok ? <p className={s.error} role="alert">{plan.error}</p> : null}
      {plan && plan.ok ? (
        <section className={s.result} aria-live="polite" aria-label="Your study plan">
          <p className={s.meta}>
            <span>{plan.days.length} study days</span>
            <span>About {plan.minutesPerDay} minutes a day</span>
            <span>{Math.round(plan.totalMinutes / 60)} hours in all</span>
          </p>
          {plan.warnings.map((w) => <p key={w} className={s.note}>{w}</p>)}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th scope="col">Day</th><th scope="col">Study</th><th scope="col">Minutes</th></tr></thead>
              <tbody>
                {plan.days.map((d) => (
                  <tr key={d.date}>
                    <td><time dateTime={d.date}>{d.date}</time></td>
                    <td>{d.items.map((it, i) => <div key={i}><span className={it.hard ? s.hard : undefined}>{it.topic}</span><span className={s.kind}>{KIND[it.kind]}</span> {it.minutes} min</div>)}</td>
                    <td>{d.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
