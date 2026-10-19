"use client";

import { useEffect, useState } from "react";
import { activityView, type ActivityItem } from "@/lib/business/activity";
import { count, type Pulse } from "./pulse";
import type { HomePlace } from "./Home";
import a from "./activity.module.css";

const EVERY_MS = 60_000;

function ago(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - t) / 60_000));
  return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
}

/**
 * Pending biz_approvals on the business work page: a count and the newest rows, from GET /api/business/approvals.
 * Opening a row or Review goes to the existing Approvals screen, which is where a decision is made.
 */
export function ActivityCenter({ pulse, onOpen }: { pulse: Pulse | null; onOpen: (place: HomePlace) => void }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/business/approvals", { cache: "no-store", headers: { "x-keplar-activity": "1" } })
        .then(async (res) => {
          if (!res.ok) throw new Error("status");
          return res.json() as Promise<unknown>;
        })
        .then((body) => {
          if (!current) return;
          const view = activityView(body);
          setItems(view.items);
          setPending(view.count);
          setFailed(false);
        })
        .catch(() => {
          if (!current) return;
          setFailed(true);
        });
    };
    load();
    const timer = window.setInterval(load, EVERY_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [tick]);

  const shown = pending ?? pulse?.approvals.pending ?? null;
  const open = () => onOpen("approvals");
  const others: { key: string; text: string; place: HomePlace }[] = [];
  if (pulse?.agents.halted) others.push({ key: "halted", text: "Every agent is paused", place: "agents" });
  const failedRun = pulse?.agents.recentRuns.find((run) => run.status === "failed" || run.status === "error");
  if (failedRun) others.push({ key: "failed", text: `${failedRun.agentName} failed its last run`, place: "agents" });
  const waiting = shown === 0 && items && items.length === 0 && !failed && others.length === 0;

  return (
    <section className={a.panel} aria-labelledby="home-activity" data-activity-center="">
      <div className={a.head}>
        <h2 id="home-activity" className={a.title}>Activity</h2>
        {shown !== null ? <span className={a.count} data-activity-count={shown} aria-label={`${count(shown)} pending`}>{count(shown)}</span> : null}
        <button type="button" className={a.review} onClick={open} aria-label={shown ? `Review ${count(shown)} pending approvals` : "Review approvals"}>Review</button>
      </div>
      {items === null && !failed ? (
        <div aria-busy="true">
          <span className={`m-skeleton ${a.skel}`} />
          <span className={`m-skeleton ${a.skel}`} />
        </div>
      ) : null}
      {failed ? (
        <>
          <p className={a.alert} role="alert">Approvals could not be loaded.</p>
          <button type="button" className={a.retry} onClick={() => setTick((n) => n + 1)}>Try again</button>
        </>
      ) : null}
      {items && items.length > 0 ? (
        <ul className={a.list} aria-label="Pending approvals">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className={a.row} onClick={open}>
                <span className={a.text}>{item.label}</span>
                <span className={a.meta}>{item.agentName}{ago(item.createdAt) ? ` · ${ago(item.createdAt)}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items && items.length === 0 && !failed && !waiting ? <p className={a.empty}>Nothing is waiting for approval.</p> : null}
      {waiting ? <p className={a.empty}>Nothing is waiting for you.</p> : null}
      {shown !== null && items && shown > items.length ? <p className={a.more}>{count(items.length)} of {count(shown)} pending. Review opens the rest.</p> : null}
      {others.length ? (
        <ul className={a.also}>
          {others.map((item) => (
            <li key={item.key}>
              <button type="button" className={a.row} onClick={() => onOpen(item.place)}>
                <span className={a.text}>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
