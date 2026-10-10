"use client";

import { projectTimeline } from "@/lib/spatial/policy";
import type { AppState } from "./state/types";
import s from "./App.module.css";

/** Real projects and threads on one time axis. Dot = a thread at the moment it was created; nothing is inferred. */
export function ProjectTimeline({ state, onOpenThread }: { state: AppState; onOpenThread: (id: string) => void }) {
  const tl = projectTimeline(state.projects, state.threads.filter((t) => t.messages.length > 0 || t.remote));
  if (!tl) return <p className={s.viewEmpty}>The timeline appears once you have a few threads or projects.</p>;
  const d = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <section className={s.timeline} aria-label="Project timeline">
      <ol className={s.tlLanes}>
        {tl.lanes.map((l) => (
          <li key={l.id} className={s.tlLane}>
            <span className={s.tlName}>{l.name}</span>
            <span className={s.tlTrack}>
              <span className={s.tlStart} style={{ left: `${l.start * 100}%` }} title={`Project created ${d(tl.from + l.start * (tl.to - tl.from))}`} aria-hidden="true" />
              {l.items.map((it) => (
                <button key={it.id} type="button" className={s.tlDot} style={{ left: `${it.pos * 100}%` }} onClick={() => onOpenThread(it.id)} title={`${it.title} · ${d(it.at)}`} aria-label={`${it.title}, ${d(it.at)}`} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className={s.tlAxis}><span>{d(tl.from)}</span><span>{d(tl.to)}</span></p>
    </section>
  );
}
