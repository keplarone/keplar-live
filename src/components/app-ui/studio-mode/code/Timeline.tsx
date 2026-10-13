"use client";
/**
 * The run's real event log as a timeline: one row per event (time since the first event, a status dot, label, detail), a
 * divider per model request. New rows fade in; nothing is shown that is not in the log.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { describeEvent, type StudioEvent } from "./events";
import { Head, useCollapse } from "./parts";
import s from "./code.module.css";

export type TimelineProps = {
  events: readonly StudioEvent[];
  /** Show only the newest N rows until "Show all" is pressed (default 200). */
  limit?: number;
  /** Optional filter, e.g. (e) => e.kind !== "studio.looked". */
  filter?: (e: StudioEvent) => boolean;
  /** Only this action's events (a feed card's own timeline). */
  action?: string;
  title?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
  className?: string;
  /** Max height of the scrolling list (CSS length). */
  maxHeight?: string;
};

function clock(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Events that belong to one action (by its key). */
function ofAction(e: StudioEvent, k: string): boolean {
  return "action" in e && e.action === k;
}

export function Timeline({ events, limit = 200, filter, action, title = "Timeline", collapsed: c, defaultCollapsed, onCollapsedChange, className, maxHeight = "320px" }: TimelineProps) {
  const [collapsed, setCollapsed] = useCollapse(c, onCollapsedChange, defaultCollapsed);
  const [all, setAll] = useState(false);
  const shown = useMemo(() => events.filter((e) => (!filter || filter(e)) && (!action || ofAction(e, action))), [events, filter, action]);
  const rows = all ? shown : shown.slice(-limit);
  const t0 = events[0]?.at ?? 0;
  const id = useId();
  // Keep the newest row in view while the list is scrolled to the bottom (the person scrolling up stops that).
  const list = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows.length, collapsed]);
  return (
    <section className={`${s.root} ${s.panel} ${className ?? ""}`} data-collapsed={collapsed ? "true" : "false"} aria-label={title}>
      <Head title={title} meta={shown.length ? `${shown.length} event${shown.length === 1 ? "" : "s"}` : "No events yet"} collapsed={collapsed} onToggle={setCollapsed} controls={id} />
      {collapsed ? null : (
        <ol id={id} ref={list} className={s.log} role="log" aria-live="polite" style={{ maxHeight }}
          onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
          {rows.length < shown.length ? (
            <li className={s.more}><button type="button" className={s.act} onClick={() => setAll(true)}>Show {shown.length - rows.length} earlier</button></li>
          ) : null}
          {rows.map((e, i) => {
            const d = describeEvent(e);
            const prev = rows[i - 1];
            return (
              <Fragment key={e.id}>
                {e.kind === "request.sent" && prev ? <li className={s.turn} aria-hidden="true">Request {e.turn}</li> : null}
                <li className={s.row} data-kind={e.kind} data-tone={d.tone}>
                  <time className={s.time} dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleTimeString()}>{clock(e.at - t0)}</time>
                  <span className={s.dot} data-tone={d.tone} aria-hidden="true" />
                  <span><span className={s.label}>{d.label}</span>{d.detail ? <span className={s.detail}>{d.detail}</span> : null}</span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
