import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoreActions, type CoreAction } from "@/components/admin/CoreActions";
import { dashboard } from "@/lib/core/selfdev/admin";
import { VARIANT_TARGETS } from "@/lib/core/selfdev/types";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

const NO = "No data yet";
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(0)}%`);
const when = (iso?: string) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "never");

function Table({ head, rows, empty = NO }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className={s.empty}>{empty}</p>;
  return (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** A small bar series (flat bars, no fills that fade). */
function Bars({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return <p className={s.empty}>{NO}</p>;
  const max = Math.max(...values, 1e-9);
  return (
    <div className={s.spark} role="img" aria-label={`${label}: ${values.map((v) => v.toFixed(2)).join(", ")}`}>
      {values.map((v, i) => <span key={i} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />)}
    </div>
  );
}

/**
 * Keplar Core: quality, latency, cost and calibration over time; the prompt/strategy variants with their canaries; evals;
 * failure clusters; code proposals waiting for review; and the change log. Admin only.
 */
export default async function AdminCorePage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const d = await dashboard(30);
  const series = d.series;
  const live = d.variants.filter((v) => v.status === "champion" || v.status === "canary");
  const queue = d.variants.filter((v) => v.status === "candidate");
  const review = d.variants.filter((v) => v.status === "pending_review");
  const open = d.proposals.filter((p) => p.status === "open");
  const targetActions: CoreAction[] = VARIANT_TARGETS.filter((t) => live.some((v) => v.target === t)).map((t) => ({ label: `Roll back ${t}`, action: "rollback", target: t, tone: "danger", confirm: `Roll back the ${t} change? It takes effect within a minute.`, askReason: true }));
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · Keplar Core · last 30 days</p>
        <h1>Core</h1>
        <p className={s.sub}>
          Keplar Core plans, checks and revises answers. It improves its own prompts, routing hints, retrieval and strategies from outcomes; it does <b>not</b> retrain the AI models.
          Automatic changes are limited to short prompt strategies and bounded settings; each must pass safety checks and beat the current version on evals, then waits for your approval before it serves a {d.state.canaryPct}% canary; a canary that does as well on live results waits for you to promote it. Roll-backs stay automatic.
          Changes that need code are only proposed here. <Link href="/admin">Back to Operations</Link>
        </p>
      </header>

      {d.state.killed ? <p className={s.alertBad}>Core is switched off. Ask runs exactly as before Core; nothing is learned or changed.</p> : null}
      {d.state.frozen ? <p className={s.alertWarn}>Frozen: only the built-in prompts are used and nothing is promoted.</p> : null}
      {!d.durable ? <p className={s.alertWarn}>No DATABASE_URL: outcomes, variants and jobs are kept in the server&rsquo;s file store and do not survive a redeploy.</p> : null}
      {!d.cron ? <p className={s.alertWarn}>CRON_SECRET is not set: the daily Core run (/api/cron/core) cannot be called by Vercel Cron. Use &ldquo;Run now&rdquo;.</p> : null}
      {open.length ? <p className={s.alertWarn}>{open.length} code proposal{open.length === 1 ? "" : "s"} waiting for review.</p> : null}

      <section className={s.grid} aria-label="Headline numbers">
        <div className={s.stat}><span>Turns</span><b>{series.reduce((a, x) => a + x.turns, 0).toLocaleString("en-US")}</b><small>{series.reduce((a, x) => a + x.deep, 0)} step by step, {series.reduce((a, x) => a + x.escalated, 0)} escalated</small></div>
        <div className={s.stat}><span>Quality (reward)</span><b>{series.length ? pct(series[series.length - 1]!.quality) : "—"}</b><small>Latest day; checks blended with feedback</small></div>
        <div className={s.stat}><span>Latency p50 / p95</span><b>{series.length ? `${(series[series.length - 1]!.p50 / 1000).toFixed(1)}s` : "—"}</b><small>{series.length ? `p95 ${(series[series.length - 1]!.p95 / 1000).toFixed(1)}s` : NO}</small></div>
        <div className={s.stat}><span>Last run</span><b>{when(d.state.lastRunAt)}</b><small>{d.state.lastRunSummary ?? "Has not run yet."}</small></div>
      </section>

      <section className={s.panel} aria-labelledby="ctl">
        <h2 id="ctl">Controls</h2>
        <CoreActions
          actions={[
            d.state.killed ? { label: "Switch Core back on", action: "unkill", tone: "warn" } : { label: "Kill switch: turn Core off", action: "kill", tone: "danger", confirm: "Turn Core off for everyone? Ask runs exactly as before. Takes effect within a minute.", askReason: true },
            { label: d.state.frozen ? "Unfreeze" : "Freeze learned changes", action: d.state.frozen ? "unfreeze" : "freeze", tone: "warn" },
            ...targetActions,
            { label: "Run now", action: "run" },
          ]}
        />
      </section>

      <section className={s.cols}>
        <div className={s.panel}><h2>Quality by day</h2><Bars values={series.map((x) => x.quality)} label="Quality by day" /></div>
        <div className={s.panel}><h2>Latency p50 by day</h2><Bars values={series.map((x) => x.p50)} label="Median latency by day" /></div>
        <div className={s.panel}><h2>Credits by day</h2><Bars values={series.map((x) => x.units)} label="Credits by day" /></div>
        <div className={s.panel}><h2>Calibration gap by day</h2><Bars values={series.map((x) => x.calibrationGap ?? 0)} label="Calibration gap by day (lower is better)" /><p className={s.sub}>Mean distance between stated confidence and how answers actually landed (turns with feedback). Lower is better.</p></div>
      </section>

      <section className={s.panel} aria-labelledby="daily">
        <h2 id="daily">Daily numbers</h2>
        <Table head={["Day", "Turns", "Quality", "p50", "p95", "Credits", "Avg calls", "Step by step", "Escalated", "Feedback", "Calibration gap"]} rows={series.slice(-14).reverse().map((x) => [x.day, x.turns, pct(x.quality), `${(x.p50 / 1000).toFixed(1)}s`, `${(x.p95 / 1000).toFixed(1)}s`, x.units, x.calls.toFixed(1), x.deep, x.escalated, x.feedback, x.calibrationGap === null ? "—" : x.calibrationGap.toFixed(2)])} />
        <p className={s.sub}>Learned calibration (stated → observed): {Object.keys(d.state.calibration ?? {}).length ? Object.entries(d.state.calibration!).map(([b, v]) => `${b} → ${pct(v)}`).join(", ") : "not enough feedback yet (30 turns per bucket)."}</p>
      </section>

      <section className={s.panel} aria-labelledby="vars">
        <h2 id="vars">Live variants and canaries</h2>
        <Table head={["Target", "Status", "Label", "Turns", "Reward", "Eval vs champion", "Since"]} rows={live.map((v) => [v.target, v.readyToPromote ? "canary · ready to promote" : v.status, v.label, v.stats.turns, v.stats.turns ? pct(v.stats.good / Math.max(1, v.stats.good + v.stats.bad)) : "—", v.evalScore !== undefined ? `${pct(v.evalScore)} vs ${pct(v.championEvalScore)}` : "—", when(v.promotedAt ?? v.createdAt)])} empty="Built-in prompts everywhere (no learned variant yet)." />
        <CoreActions actions={live.filter((v) => v.status === "canary").flatMap((v): CoreAction[] => [{ label: `Promote ${v.label}`, action: "promote", id: v.id, tone: "warn", confirm: "Promote this canary to champion now?" }, { label: `Reject ${v.label}`, action: "reject", id: v.id }])} />
        <h3>Waiting for your review</h3>
        <p className={s.sub}>Passed safety checks and evals. Nothing here serves any traffic until you approve it as a canary.</p>
        <Table head={["Target", "Label", "Strategy text", "Settings", "Eval vs champion", "From"]} rows={review.map((v) => [v.target, v.label, v.text || "—", JSON.stringify(v.params), v.evalScore !== undefined ? `${pct(v.evalScore)} vs ${pct(v.championEvalScore)}` : "—", v.cluster ?? v.origin])} empty="Nothing waiting for review." />
        <CoreActions actions={review.slice(0, 6).flatMap((v): CoreAction[] => [{ label: `Approve ${v.label} as canary`, action: "approve", id: v.id, tone: "warn", confirm: "Read the strategy text first. Approve it as a canary?" }, { label: `Reject ${v.label}`, action: "reject", id: v.id }])} />
        <h3>Waiting for evaluation</h3>
        <Table head={["Target", "Label", "Strategy text", "Settings", "From"]} rows={queue.map((v) => [v.target, v.label, v.text || "—", JSON.stringify(v.params), v.cluster ?? v.origin])} empty="No candidates queued." />
        <CoreActions actions={queue.slice(0, 6).map((v): CoreAction => ({ label: `Reject ${v.label}`, action: "reject", id: v.id }))} />
      </section>

      <section className={s.panel} aria-labelledby="evals">
        <h2 id="evals">Evals</h2>
        <Table head={["When", "Kind", "What", "Items", "Score", "Guard failures"]} rows={d.evals.map((e) => [when(e.at), e.kind, e.label, e.n, pct(e.score), e.guardFailures.join("; ") || "none"])} empty="No eval has run yet (needs the free model key and the daily run)." />
      </section>

      <section className={s.panel} aria-labelledby="gaps">
        <h2 id="gaps">Where answers go wrong (latest clusters)</h2>
        <Table head={["Group", "Turns", "Bad outcomes", "Fix type", "Topic words (opted-in only)"]} rows={d.gaps.map((g) => [g.label, g.turns, pct(g.badRate), g.need, g.examples.join("; ") || "—"])} empty="No cluster has enough failed turns yet." />
      </section>

      <section className={s.panel} aria-labelledby="props">
        <h2 id="props">Code proposals (never applied automatically)</h2>
        {d.proposals.length === 0 ? <p className={s.empty}>None.</p> : null}
        {d.proposals.slice(0, 10).map((p) => (
          <div key={p.id}>
            <h3>{p.title} · {p.status}</h3>
            <p className={s.sub}>{p.evidence}</p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "var(--t-small)", border: "var(--b-hairline) solid var(--c-border)", padding: "var(--s-3)", borderRadius: "var(--r-sm)" }}>{p.diff}</pre>
            {p.status === "open" ? <CoreActions actions={[{ label: "Approve (implementation still goes through review)", action: "approve-proposal", id: p.id, tone: "warn" }, { label: "Reject", action: "reject-proposal", id: p.id }]} /> : <p className={s.sub}>Decided by {p.decidedBy} at {when(p.decidedAt)}.</p>}
          </div>
        ))}
      </section>

      <section className={s.panel} aria-labelledby="log">
        <h2 id="log">Change log</h2>
        <Table head={["When", "Action", "Target", "By", "Note"]} rows={d.changes.map((c) => [when(c.at), c.action, c.target ?? "—", c.by, c.note])} empty="Nothing has changed yet." />
      </section>
    </div>
  );
}
