import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { profitabilityReport } from "@/lib/cost/report";
import { FEATURE_LABELS, FEATURES, type FeatureId } from "@/lib/cost/features";
import { estimateTable } from "@/lib/cost/estimates";
import { CostControls } from "@/components/admin/CostControls";
import s from "@/components/admin/Admin.module.css";
import p from "@/components/admin/Profit.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profitability" };

const usd = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(Math.abs(n) < 1 && n !== 0 ? 4 : 2)}`);
const pctTxt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);
const RANGES = [7, 30, 90];

/** Admin-only: provider cost by feature/model/plan/day, revenue vs cost per user, margin per feature, guards. */
export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const q = await searchParams;
  const days = RANGES.includes(Number(q.days)) ? Number(q.days) : 30;
  const r = await profitabilityReport(days);
  const t = r.totals;
  const max = Math.max(0.0001, ...r.byDay.map((d) => d.usd));
  const throttled = Object.keys(r.throttles) as FeatureId[];
  const killed = (Object.entries(r.config.killSwitches) as [FeatureId, boolean][]).filter(([, v]) => v).map(([k]) => k);
  const est = estimateTable();

  return (
    <div className={`${s.page} ${p.wrap}`}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · profitability · last {days} days</p>
        <h1>Cost &amp; profitability</h1>
        <p className={s.sub}>Every provider call is metered at the fetch boundary (feature, user, plan, model, tokens, actual cost, latency). Feature revenue = credits charged on it × the payer&apos;s revenue per credit. Generated {r.generatedAt.replace("T", " ").slice(0, 16)} UTC. <Link href="/admin">Operations</Link> · <Link href="/admin/costs">Per-request costs</Link></p>
        <nav className={p.range} aria-label="Range">{RANGES.map((d) => <a key={d} href={`?days=${d}`} aria-current={d === days ? "page" : undefined}>{d} days</a>)}</nav>
      </header>

      {r.balanceExhausted ? <p className={s.alertBad} role="alert">OpenRouter credit is exhausted: paid-model answers are falling back to free models and paid image/video is paused. Top up at openrouter.ai/settings/credits, then re-enable below.</p> : null}
      {r.balance?.low && !r.balanceExhausted ? <p className={s.alertBad} role="alert">OpenRouter balance is low: {usd(r.balance.remaining)} left ({r.balance.percent.toFixed(2)}% of {r.balance.basis === "last_topup" ? "the last top-up" : "total purchased"}). Top up at openrouter.ai/settings/credits.</p> : null}
      {r.balance?.runway === "critical" && !r.balanceExhausted ? <p className={s.alertBad} role="alert">OpenRouter runway is critical: about {r.balance.runwayDays ?? 0} days left at {usd(r.balance.spend24hUsd)} per day (critical at {r.config.lowBalance.runwayCriticalDays} days). Top up now.</p> : null}
      {r.balance?.runway === "warn" ? <p className={s.alertWarn}>OpenRouter runway: about {r.balance.runwayDays} days left at {usd(r.balance.spend24hUsd)} per day (warning at {r.config.lowBalance.runwayWarnDays} days).</p> : null}
      {r.globalCap && r.globalCap.level !== "ok" ? <p className={r.globalCap.level === "capped" ? s.alertBad : s.alertWarn} role="alert">Provider spend today is {usd(r.globalCap.todayUsd)}, {r.globalCap.pct.toFixed(0)}% of KEPLAR_GLOBAL_DAILY_USD_CAP (${r.globalCap.capUsd}). {r.globalCap.level === "capped" ? "Free is paused until 00:00 UTC. Image and video keep running." : "Builds use lighter models. Free pauses at 100%. Image and video keep running."}</p> : null}
      {r.globalCap?.needsRaise ? <p className={s.alertWarn}>The daily cap (${r.globalCap.capUsd}) is below {r.config.globalCap.recommendFactor}× the busiest recent day ({usd(r.globalCap.busiestDayUsd)}). Suggested cap: ${r.globalCap.recommendedUsd}. Raise KEPLAR_GLOBAL_DAILY_USD_CAP in Vercel as usage grows (owner decision).</p> : null}
      {!r.balance ? <p className={s.alertWarn}>No OpenRouter balance reading yet. The credits endpoint needs OPENROUTER_MANAGEMENT_KEY (or a credit limit on OPENROUTER_API_KEY).</p> : null}
      {throttled.length ? <p className={s.alertWarn}>Throttled (negative margin or admin): {throttled.join(", ")}.</p> : null}
      {killed.length ? <p className={s.alertWarn}>Switched off: {killed.join(", ")}.</p> : null}
      {r.truncated ? <p className={s.alertWarn}>Showing the newest 100,000 calls only; totals are partial.</p> : null}

      <section className={s.grid} aria-label="Summary">
        <div className={s.stat}><span>Provider cost</span><b>{usd(t.usd)}</b><small>{t.calls.toLocaleString("en-US")} calls · {usd(t.estimatedUsd)} price-table estimated</small></div>
        <div className={s.stat}><span>Revenue (prorated)</span><b>{usd(t.revenue)}</b><small>{t.payers} paying · {usd(t.allocatedRevenue)} earned by credits used</small></div>
        <div className={s.stat}><span>Gross margin</span><b className={t.margin < 0 ? p.neg : undefined}>{usd(t.margin)}</b><small>{pctTxt(t.marginPct)} of revenue (provider cost only)</small></div>
        <div className={s.stat}><span>Guarded</span><b>{t.blocked.toLocaleString("en-US")}</b><small>calls refused · {t.degraded} sent on free fallback</small></div>
        <div className={s.stat}><span>OpenRouter balance</span><b className={r.balance?.low ? p.neg : undefined}>{r.balance ? usd(r.balance.remaining) : "—"}</b><small>{r.balance ? `${r.balance.percent.toFixed(2)}% · ${r.balance.source === "key_limit" ? "key limit" : "account"} · ${r.balance.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "not checked"}</small></div>
        <div className={s.stat}><span>Runway</span><b className={r.balance?.runway === "critical" ? p.neg : undefined}>{r.balance?.runwayDays !== null && r.balance?.runwayDays !== undefined ? `${r.balance.runwayDays} days` : "—"}</b><small>{r.balance?.spend24hUsd !== null && r.balance?.spend24hUsd !== undefined ? `${usd(r.balance.spend24hUsd)} spent in the last 24 h` : "needs 1 h of balance readings"}</small></div>
        <div className={s.stat}><span>Daily cap</span><b className={r.globalCap?.level === "capped" ? p.neg : undefined}>{r.globalCap ? `${r.globalCap.pct.toFixed(0)}%` : "—"}</b><small>{r.globalCap ? `${usd(r.globalCap.todayUsd)} of $${r.globalCap.capUsd} today · suggest $${r.globalCap.recommendedUsd}` : "unavailable"}</small></div>
        <div className={s.stat}><span>Revenue source</span><b>{r.stripe.configured ? "Stripe" : "Plan prices"}</b><small>{r.stripe.configured ? `${r.stripe.matched} matched${r.stripe.error ? ` · error: ${r.stripe.error}` : ""}` : "list prices × active subscriptions"}</small></div>
      </section>

      <section className={s.panel} aria-labelledby="day-h">
        <h2 id="day-h">Cost by day (UTC)</h2>
        <div className={p.bars} role="img" aria-label={`Daily provider cost, peak ${usd(max)}`}>
          {r.byDay.map((d) => <span key={d.day} className={p.bar} style={{ height: `${Math.max(0.5, (d.usd / max) * 100)}%` }} title={`${d.day}: ${usd(d.usd)} · ${d.calls} calls`} />)}
        </div>
        <div className={p.axis}><span>{r.byDay[0]?.day}</span><span>peak {usd(max)}</span><span>{r.byDay.at(-1)?.day}</span></div>
      </section>

      <section className={s.panel} aria-labelledby="feat-h">
        <h2 id="feat-h">Margin by feature</h2>
        <div className={s.scroll}><table className={s.table}>
          <thead><tr><th scope="col">Feature</th><th scope="col">Calls</th><th scope="col">Users</th><th scope="col">Cost</th><th scope="col">+ overhead</th><th scope="col">Credits</th><th scope="col">Revenue</th><th scope="col">Margin</th><th scope="col">Margin %</th><th scope="col">Estimated</th><th scope="col">Guard</th></tr></thead>
          <tbody>{r.byFeature.length ? r.byFeature.map((l) => (
            <tr key={l.feature}>
              <td>{FEATURE_LABELS[l.feature] ?? l.feature}</td><td>{l.calls.toLocaleString("en-US")}</td><td>{l.users}</td><td>{usd(l.usd)}</td><td>{l.overheadUsd ? usd(l.overheadUsd) : "—"}</td>
              <td>{Math.round(l.credits).toLocaleString("en-US")}</td><td>{usd(l.revenue)}</td>
              <td className={l.marginPct !== null && l.margin < 0 ? p.neg : undefined}>{l.marginPct === null ? <span className={p.muted}>overhead</span> : usd(l.margin)}</td>
              <td>{pctTxt(l.marginPct)}</td><td>{l.estimatedShare ? `${l.estimatedShare.toFixed(0)}%` : "—"}</td>
              <td>{r.config.killSwitches[l.feature] ? <span className={`${p.tag} ${p.tagBad}`}>off</span> : null}{r.throttles[l.feature] ? <span className={`${p.tag} ${p.tagBad}`}>throttled</span> : null}{l.blocked ? <span className={p.tag}>{l.blocked} refused</span> : null}{l.degraded ? <span className={p.tag}>{l.degraded} fallback</span> : null}</td>
            </tr>
          )) : <tr><td colSpan={11} className={p.muted}>No metered calls in this window yet.</td></tr>}</tbody>
        </table></div>
      </section>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="plan-h">
          <h2 id="plan-h">Revenue vs cost by plan</h2>
          <div className={s.scroll}><table className={s.table}>
            <thead><tr><th scope="col">Plan</th><th scope="col">Payers</th><th scope="col">Active</th><th scope="col">Cost</th><th scope="col">Revenue</th><th scope="col">Margin</th></tr></thead>
            <tbody>{r.byPlan.map((x) => <tr key={x.plan}><td>{x.plan}</td><td>{x.payers}</td><td>{x.activeUsers}</td><td>{usd(x.usd)}</td><td>{usd(x.revenue)}</td><td className={x.margin < 0 ? p.neg : undefined}>{usd(x.margin)}</td></tr>)}</tbody>
          </table></div>
        </section>
        <section className={s.panel} aria-labelledby="an-h">
          <h2 id="an-h">Anomalies</h2>
          {r.anomalies.length ? <ul className={p.list}>{r.anomalies.map((a, i) => <li key={i} className={a.level === "bad" ? p.neg : undefined}>{a.message}</li>)}</ul> : <p className={s.empty}>None in this window.</p>}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="user-h">
        <h2 id="user-h">Top-cost users (revenue vs cost)</h2>
        <div className={s.scroll}><table className={s.table}>
          <thead><tr><th scope="col">User</th><th scope="col">Plan</th><th scope="col">Calls</th><th scope="col">Cost</th><th scope="col">Revenue</th><th scope="col">Margin</th><th scope="col">Top feature</th><th scope="col">Revenue source</th></tr></thead>
          <tbody>{r.byUser.length ? r.byUser.map((u) => <tr key={u.userId}><td>{u.email}</td><td>{u.plan}</td><td>{u.calls}</td><td>{usd(u.usd)}</td><td>{usd(u.revenue)}</td><td className={u.margin < 0 ? p.neg : undefined}>{usd(u.margin)}</td><td>{u.topFeature ?? "—"}</td><td>{u.revenueSource}</td></tr>) : <tr><td colSpan={8} className={p.muted}>No attributed usage yet.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className={s.panel} aria-labelledby="model-h">
        <h2 id="model-h">Cost by model</h2>
        <div className={s.scroll}><table className={s.table}>
          <thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Calls</th><th scope="col">Errors</th><th scope="col">Tokens in</th><th scope="col">Tokens out</th><th scope="col">Cost</th><th scope="col">p50</th><th scope="col">p95</th></tr></thead>
          <tbody>{r.byModel.length ? r.byModel.map((m) => <tr key={`${m.provider}|${m.model}`}><td>{m.model}</td><td>{m.provider}</td><td>{m.calls}</td><td>{m.errors}</td><td>{m.tokensIn.toLocaleString("en-US")}</td><td>{m.tokensOut.toLocaleString("en-US")}</td><td>{usd(m.usd)}</td><td>{m.p50Ms === null ? "—" : `${(m.p50Ms / 1000).toFixed(1)} s`}</td><td>{m.p95Ms === null ? "—" : `${(m.p95Ms / 1000).toFixed(1)} s`}</td></tr>) : <tr><td colSpan={9} className={p.muted}>No metered calls yet.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className={s.panel} aria-labelledby="ctl-h">
        <h2 id="ctl-h">Guards</h2>
        <CostControls flags={r.config.flags} killSwitches={r.config.killSwitches as Record<string, boolean>} throttles={r.throttles as Record<string, { action: string; until: string; reason: string }>} features={FEATURES.filter((f) => f !== "untagged" && f !== "system").map((f) => ({ id: f, label: FEATURE_LABELS[f] }))} marginMultiplier={r.config.pricing.marginMultiplier} lowBalance={r.config.lowBalance} balanceExhausted={r.balanceExhausted} />
      </section>

      <section className={s.panel} aria-labelledby="est-h">
        <h2 id="est-h">Per-feature cost estimates (price table, not measured)</h2>
        <p className={s.sub}>Typical provider cost of one use on each plan, from the price table and typical call shapes. Replace with measured averages above once traffic accrues.</p>
        <div className={s.scroll}><table className={s.table}>
          <thead><tr><th scope="col">Feature</th><th scope="col">Assumption</th><th scope="col">Free</th><th scope="col">Plus / Pro (est.)</th><th scope="col">Credits charged (est.)</th></tr></thead>
          <tbody>{est.map((e) => <tr key={e.feature}><td>{FEATURE_LABELS[e.feature]}</td><td>{e.assumption}</td><td>$0</td><td>{usd(e.paidUsd)}</td><td>{e.credits}</td></tr>)}</tbody>
        </table></div>
      </section>

      <details className={s.panel}>
        <summary>Effective configuration (defaults ← KEPLAR_COST_CONFIG ← admin overrides ← env switches)</summary>
        <pre className={p.pre}>{JSON.stringify(r.config, null, 2)}</pre>
      </details>
    </div>
  );
}
