import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { recentRequestCosts, summarizeCosts } from "@/lib/ops/request-cost";
import { PLAN_LIMITS, type LimitPlan } from "@/lib/orchestration/limits";
import { breakerLevel } from "@/lib/create/platform/breaker";
import { sharedPool } from "@/lib/orchestration/pool-governor";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

/** Per-request provider cost (real per-call USD recorded by the model registry; Free runs on $0 models). Admin only. */
export default async function AdminCostsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [rows, level, pool] = await Promise.all([recentRequestCosts(7).catch(() => null), breakerLevel(), sharedPool().status().catch(() => null)]);
  const c = rows ? summarizeCosts(rows) : null;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · costs · last 7 days</p>
        <h1>Cost per request</h1>
        <p className={s.sub}>One row per answered request, written by the server with the provider cost it actually incurred. Rows are kept 30 days; no prompt or answer text is stored. Spend breaker now: <b>{level}</b>.{pool ? <> Free pool today: <b>{pool.usedToday}</b> of {pool.usable} requests used ({pool.level}), {pool.minuteLeft} of {pool.rpm} left this minute; resets {new Date(pool.resetsAt).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET.</> : null} <Link href="/admin">Operations</Link></p>
      </header>
      {!c ? <p className={s.empty}>Could not read the cost log.</p> : !c.requests ? <p className={s.empty}>No requests logged yet.</p> : (
        <>
          <section className={s.grid} aria-label="Cost summary">
            <div className={s.stat}><span>Requests logged</span><b>{c.requests.toLocaleString("en-US")}</b><small>{c.answered.toLocaleString("en-US")} answered</small></div>
            <div className={s.stat}><span>Provider cost</span><b>{usd(c.usd)}</b><small>sum of recorded model calls</small></div>
            <div className={s.stat}><span>Average per request</span><b>{usd(c.avgUsd)}</b><small>p95 {usd(c.p95Usd)}</small></div>
            <div className={s.stat}><span>Used fewer models</span><b>{Object.values(c.degraded).reduce((a, b) => a + b, 0)}</b><small>{Object.entries(c.degraded).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none"}</small></div>
          </section>
          <section className={s.panel} aria-labelledby="plan-h">
            <h2 id="plan-h">By plan</h2>
            <div className={s.scroll}><table className={s.table}><thead><tr><th scope="col">Plan</th><th scope="col">Requests</th><th scope="col">Provider cost</th><th scope="col">Avg / request</th><th scope="col">Provider requests / question</th><th scope="col">Credits charged</th><th scope="col">Full-panel runs / day cap</th></tr></thead>
              <tbody>{c.byPlan.map((p) => <tr key={p.plan}><td>{p.plan}</td><td>{p.requests}</td><td>{usd(p.usd)}</td><td>{usd(p.avgUsd)}</td><td>{p.avgCalls.toFixed(1)}</td><td>{Math.round(p.units).toLocaleString("en-US")}</td><td>{PLAN_LIMITS[p.plan as LimitPlan]?.dailyFanoutRuns ?? "—"}</td></tr>)}</tbody></table></div>
          </section>
          <section className={s.panel} aria-labelledby="day-h">
            <h2 id="day-h">By day (UTC)</h2>
            <div className={s.scroll}><table className={s.table}><thead><tr><th scope="col">Day</th><th scope="col">Requests</th><th scope="col">Provider cost</th></tr></thead>
              <tbody>{c.byDay.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.requests}</td><td>{usd(d.usd)}</td></tr>)}</tbody></table></div>
          </section>
          <section className={s.panel} aria-labelledby="top-h">
            <h2 id="top-h">Most expensive requests</h2>
            <div className={s.scroll}><table className={s.table}><thead><tr><th scope="col">When (UTC)</th><th scope="col">Request id</th><th scope="col">Plan</th><th scope="col">Cost</th><th scope="col">Calls (failed)</th><th scope="col">Models</th><th scope="col">Time</th><th scope="col">Note</th></tr></thead>
              <tbody>{c.top.map((r) => <tr key={r.id}><td>{r.at.replace("T", " ").slice(0, 16)}</td><td>{r.reqId}</td><td>{r.plan}</td><td>{usd(r.usd)}</td><td>{r.modelCalls} ({r.failedCalls})</td><td>{r.distinctModels}</td><td>{(r.durationMs / 1000).toFixed(1)} s</td><td>{r.degraded ? `fewer models: ${r.degraded}` : r.answered ? "" : "no answer"}</td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
