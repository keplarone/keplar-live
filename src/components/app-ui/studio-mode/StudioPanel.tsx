"use client";

import type { StudioAgent } from "./useStudioAgent";
import s from "./studio-mode.module.css";

function ago(at: number, now: number): string {
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 60) return `${sec} s ago`;
  const min = Math.round(sec / 60);
  return `${min} min ago`;
}

/**
 * The Studio page's side panel: what Keplar sees (the latest viewport screenshot, earlier shots, look again), the plan with
 * the current step, what it has changed so far, and the run's numbers. All from the shared run (useStudioAgent).
 */
export function StudioPanel({ a, now }: { a: StudioAgent; now: number }) {
  const done = a.plan.filter((p) => p.state === "done").length;
  const pct = a.plan.length ? Math.round((done / a.plan.length) * 100) : 0;
  return (
    <aside className={s.panel} aria-label="Studio">
      <section className={s.panelCard}>
        <div className={s.panelHead}>
          <h2 className={s.panelTitle}>Viewport</h2>
          <span className={s.meta}>{a.looking ? "Looking…" : a.viewport ? `Updated ${ago(a.viewport.at, now)}` : "Not looked yet"}</span>
          <span className={s.grow} />
          <button type="button" className={s.iconBtn} onClick={() => void a.refreshViewport()} disabled={a.looking} aria-label="Let Keplar look at Studio again" title="Look again">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
        <div className={s.viewport} data-looking={a.looking || undefined}>
          {a.viewport ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio
            <img src={a.viewport.image} alt="What Keplar sees in Studio right now" />
          ) : (
            <p className={s.viewportEmpty}>Keplar takes a look at your place when you start a build. You can also look now.</p>
          )}
          <span className={s.scan} aria-hidden="true" />
          {a.place ? <span className={s.viewportTag}>{a.place.name}</span> : null}
        </div>
        {a.shots.length > 1 ? (
          <div className={s.thumbs}>
            {a.shots.slice(1, 4).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- earlier data URLs from Studio
              <img key={i} src={src} alt={`Earlier screenshot ${i + 1}`} />
            ))}
          </div>
        ) : null}
      </section>

      {a.plan.length ? (
        <section className={s.panelCard}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Plan</h2>
            <span className={s.meta}>{done} of {a.plan.length} done</span>
          </div>
          <div className={s.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Plan progress">
            <span style={{ width: `${pct}%` }} data-live={a.running || undefined} />
          </div>
          <ol className={s.planList}>
            {a.plan.map((p, i) => (
              <li key={i} data-state={p.state}>
                <span className={s.planMark} aria-hidden="true">
                  {p.state === "done" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  ) : null}
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {a.built.length ? (
        <section className={s.panelCard}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Changed so far</h2>
            <span className={s.meta}>{a.built.length}</span>
          </div>
          <ul className={s.builtList}>
            {a.built.slice(-8).map((b) => <li key={b.key}>{b.title}</li>)}
          </ul>
        </section>
      ) : null}

      <section className={s.panelCard}>
        <div className={s.panelHead}>
          <h2 className={s.panelTitle}>This run</h2>
          <span className={s.grow} />
          <span className={s.meta}>{a.units.toLocaleString()} credits used</span>
        </div>
        <span className={s.meta}>{a.stats.steps} steps · {a.stats.changes} changes · {a.stats.errors} {a.stats.errors === 1 ? "error" : "errors"}</span>
      </section>
    </aside>
  );
}
