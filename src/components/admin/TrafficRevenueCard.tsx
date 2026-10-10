"use client";

import { useEffect, useState } from "react";
import type { TrafficSummary } from "@/lib/traffic/visits";
import type { RevenueReport } from "@/lib/admin/revenue";
import { RANGES, RANGE_LABEL, type RangeId } from "@/lib/admin/ranges";
import type { LiveActivity } from "@/lib/admin/live-activity";
import s from "./Admin.module.css";

const NOT_TRACKED = "Not tracked yet";
const usd = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
const STATUS: Record<string, string> = { connected: "Connected", no_data: "Connected, no payments yet", not_connected: "Not connected" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const ago = (iso: string, now: number) => {
  const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
};

type Props = { traffic: TrafficSummary | null; revenue: RevenueReport | null; live: LiveActivity | null; presence?: number | null };

/**
 * Admin "Traffic & revenue" card. Server-rendered figures come in as props; the live visitor count and the chat activity feed
 * refresh every ~10 s from /api/admin/live (admin-only, no message text, no identities). Real data only: anything not
 * recorded says "Not tracked yet" or "Not connected".
 */
export function TrafficRevenueCard({ traffic, revenue, live: initialLive, presence = null }: Props) {
  const [live, setLive] = useState(initialLive);
  const [onSite, setOnSite] = useState<number | null>(presence);
  const [now, setNow] = useState(() => (initialLive ? Date.parse(initialLive.generatedAt) : 0));
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const visible = () => document.visibilityState !== "hidden";
    // "On the site now": one number, every ~5 s, from a tiny admin-only endpoint.
    const pullNow = async () => {
      if (!visible()) return;
      try {
        const r = await fetch("/api/admin/presence", { cache: "no-store" });
        if (!r.ok) throw new Error("status");
        const j = (await r.json()) as { onSiteNow: number | null };
        if (!alive) return;
        setOnSite(typeof j.onSiteNow === "number" ? j.onSiteNow : null);
        setStale(false);
      } catch {
        if (alive) setStale(true);
      }
    };
    // Chat activity feed: every ~10 s.
    const pullFeed = async () => {
      if (!visible()) return;
      try {
        const r = await fetch("/api/admin/live", { cache: "no-store" });
        if (!r.ok) throw new Error("status");
        const j = (await r.json()) as { onSiteNow?: number | null; activity: LiveActivity | null };
        if (!alive) return;
        if (j.activity) { setLive(j.activity); setNow(Date.parse(j.activity.generatedAt)); }
      } catch {
        /* the presence poll reports connectivity */
      }
    };
    const a = window.setInterval(() => void pullNow(), 5_000);
    const b = window.setInterval(() => void pullFeed(), 10_000);
    const v = () => { void pullNow(); void pullFeed(); };
    document.addEventListener("visibilitychange", v);
    return () => { alive = false; window.clearInterval(a); window.clearInterval(b); document.removeEventListener("visibilitychange", v); };
  }, []);

  const row = (label: string, f: (r: RangeId) => string) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      {RANGES.map((r) => <td key={r}>{f(r)}</td>)}
    </tr>
  );

  return (
    <section className={s.panel} aria-labelledby="tr-h" data-traffic-revenue="">
      <h2 id="tr-h">Traffic &amp; revenue</h2>
      <p className={s.sub}>Real records only. Visits are counted on the server with no cookies and no IP stored (a code that changes every day), and skip bots, Do Not Track and Global Privacy Control. Days are UTC.</p>

      <div className={s.grid} aria-label="Visitors">
        <div className={s.stat}><span>On the site now</span><b data-on-site-now="">{num(onSite)}</b><small>{stale ? "Refresh paused: reconnecting" : "people with a page open, updates every 5 s"}</small></div>
        <div className={s.stat}><span>Visitors today</span><b>{num(traffic?.today)}</b><small>{traffic ? `${num(traffic.pageLoadsToday)} page loads` : "needs the database"}</small></div>
        <div className={s.stat}><span>Last 7 days</span><b>{num(traffic?.last7)}</b><small>visitor-days</small></div>
        <div className={s.stat}><span>Last 30 days</span><b>{num(traffic?.last30)}</b><small>visitor-days</small></div>
        <div className={s.stat}><span>All time</span><b>{num(traffic?.allTime)}</b><small>{traffic?.since ? `counted since ${traffic.since}` : "no visits counted yet"}</small></div>
      </div>
      <p className={s.sub}>A visitor-day is one anonymous browser on one day. The code changes daily, so someone who comes back on another day counts again; these are not unique people.{traffic?.truncated ? " Figures are a floor (row limit reached)." : ""}</p>
      {traffic && (traffic.topRoutes7.length || traffic.topReferrers7.length) ? (
        <p className={s.sub}>Top pages (7 days): {traffic.topRoutes7.slice(0, 5).map((p) => `${p.route} ${p.visitors}`).join(" · ") || "none"}. Referrers: {traffic.topReferrers7.slice(0, 5).map((p) => `${p.host} ${p.visitors}`).join(" · ") || "none recorded"}.</p>
      ) : null}

      <h3>Revenue by source</h3>
      {revenue ? (
        <>
          <div className={s.scroll}>
            <table className={s.table} data-revenue-table="">
              <thead><tr><th scope="col">Source</th>{RANGES.map((r) => <th key={r} scope="col">{RANGE_LABEL[r]}</th>)}</tr></thead>
              <tbody>
                {revenue.sources.map((src) => (
                  <tr key={src.id} data-source={src.id} data-status={src.status}>
                    <th scope="row">{src.label}<br /><small>{STATUS[src.status]}. {src.note}</small></th>
                    {RANGES.map((r) => (
                      <td key={r}>
                        {src.status === "not_connected" ? "Not connected" : usd(src.revenueUsd[r])}
                        {src.unrecorded[r] ? <><br /><small>{src.unrecorded[r]} payment{src.unrecorded[r] === 1 ? "" : "s"}: amount not recorded{src.estimatedUnrecordedUsd[r] ? ` (about ${usd(src.estimatedUnrecordedUsd[r], 0)} at list price, estimate)` : ""}</small></> : null}
                        {src.refundedUsd[r] ? <><br /><small>{usd(src.refundedUsd[r])} refunded or disputed (excluded)</small></> : null}
                      </td>
                    ))}
                  </tr>
                ))}
                {row("Total revenue (recorded)", (r) => usd(revenue.totalUsd[r]))}
              </tbody>
            </table>
          </div>

          <h3>Costs &amp; profit</h3>
          <div className={s.scroll}>
            <table className={s.table} data-profit-table="">
              <thead><tr><th scope="col">Line</th>{RANGES.map((r) => <th key={r} scope="col">{RANGE_LABEL[r]}</th>)}</tr></thead>
              <tbody>
                {row("Model / API spend (customers)", (r) => (revenue.costs.modelSpendUsd && !(r === "all" && revenue.costs.spendTruncated) ? usd(revenue.costs.modelSpendUsd[r]) : NOT_TRACKED))}
                {row("Team's own usage (excluded)", (r) => (revenue.costs.teamSpendUsd ? usd(revenue.costs.teamSpendUsd[r]) : "—"))}
                {row("Whop fees (recorded)", (r) => `${usd(revenue.costs.whopFeesUsd[r])}${revenue.costs.whopFeesUnknown[r] ? ` + ${revenue.costs.whopFeesUnknown[r]} unknown` : ""}`)}
                {row("Contribution after model spend and fees", (r) => (revenue.profit[r].contributionUsd === null ? NOT_TRACKED : `${usd(revenue.profit[r].contributionUsd)}${revenue.profit[r].complete ? "" : " (partial)"}`))}
                {row("Net profit", (r) => (revenue.profit[r].netUsd === null ? NOT_TRACKED : usd(revenue.profit[r].netUsd)))}
              </tbody>
            </table>
          </div>
          <p className={s.sub} data-profit-note="">
            {revenue.costs.fixedTracked ? "Net profit subtracts the fixed costs entered for this business, pro-rated by day. " : "Net profit is not shown because fixed costs are not tracked yet. "}
            Not tracked: {revenue.notTracked.join("; ")}. To track fixed costs, add rows with POST /api/admin/fixed-costs {"{ label, usdMonthly, from }"}. “Partial” means some payments have no stored amount or fee.
          </p>
        </>
      ) : (
        <p className={s.empty}>Revenue records could not be read.</p>
      )}

      <h3>Live chat activity</h3>
      {live ? (
        <>
          <div className={s.grid} aria-label="Chat activity">
            <div className={s.stat}><span>Chats, last 5 min</span><b data-chats-5m="">{num(live.last5m)}</b><small>{num(live.modelAnswers5m)} model answers</small></div>
            <div className={s.stat}><span>Chats today (UTC)</span><b data-chats-today="">{num(live.today)}</b><small>{num(live.modelAnswersToday)} model answers{live.truncated ? " (floor)" : ""}</small></div>
          </div>
          {live.models5m.length ? <p className={s.sub}>Models answering in the last 5 min: {live.models5m.map((m) => `${m.model} ×${m.answers}`).join(" · ")}</p> : null}
          {live.feed.length ? (
            <div className={s.scroll}>
              <table className={s.table} data-activity-feed="">
                <thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Plan</th><th scope="col">Models</th><th scope="col">Took</th></tr></thead>
                <tbody>
                  {live.feed.map((e, i) => (
                    <tr key={`${e.at}-${i}`}>
                      <td title={ago(e.at, now)}>{time(e.at)}</td>
                      <td>{e.kind === "instant" ? "Instant reply" : e.answered ? "Answer" : "No answer"}</td>
                      <td>{e.plan}</td>
                      <td>{e.kind === "instant" ? "none (no model)" : e.models.length ? e.models.join(", ") : e.modelsRecorded ? "none answered" : "not recorded"}</td>
                      <td>{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.empty}>No chats yet today.</p>
          )}
          <p className={s.sub}>Shows when, which models and how long. Never the message, the answer or who asked.</p>
        </>
      ) : (
        <p className={s.empty}>Chat activity could not be read.</p>
      )}
    </section>
  );
}
