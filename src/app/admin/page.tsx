import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { adminOverview } from "@/lib/ops/metrics";
import { currentLimits, hourlyLimits, hourlyUsage } from "@/lib/ops/hourly";
import { AdminControls } from "@/components/admin/AdminControls";
import { ConnectHiggsfield } from "@/components/admin/ConnectHiggsfield";
import { higgsfieldAdminStatus } from "@/lib/higgsfield/status";
import { TrafficRevenueCard } from "@/components/admin/TrafficRevenueCard";
import { trafficSummary } from "@/lib/traffic/visits";
import { presentNow } from "@/lib/traffic/presence";
import { revenueReport } from "@/lib/admin/revenue";
import { liveActivity } from "@/lib/admin/live-activity";
import { lastOpenRouterBalance } from "@/lib/ops/openrouter-balance";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

const usd = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "—" : `$${n.toFixed(d)}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
const ms = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n)} ms`);

function Table({ head, rows, empty = "No data yet." }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className={s.empty}>{empty}</p>;
  return (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={s.spark} role="img" aria-label={label}>
      {values.map((v, i) => <span key={i} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />)}
    </div>
  );
}

export default async function AdminPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const o = await adminOverview();
  const [traffic, revenue, live, presence, orBalance] = await Promise.all([trafficSummary().catch(() => null), revenueReport().catch(() => null), liveActivity().catch(() => null), presentNow().catch(() => null), lastOpenRouterBalance()]);
  const hourly = await hourlyUsage();
  const hl = await currentLimits();
  const envHl = hourlyLimits();
  const c = o.controls;
  const nowMs = Date.parse(o.generatedAt); // the snapshot's own clock (no impure calls in render)
  const autoPaused = Boolean(c?.autoPauseUntil && Date.parse(c.autoPauseUntil) > nowMs);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · real data only · {o.generatedAt.replace("T", " ").slice(0, 16)} UTC</p>
        <h1>Operations</h1>
        <p className={s.sub}>Signed in as {admin.email.replace(/^(.).*@/, "$1***@")}. Figures come from the live database; anything that is not recorded says so. <Link href="/admin/inbox">Inbox</Link> · <Link href="/admin/costs">Costs</Link> · <Link href="/admin/errors">Errors</Link> · <Link href="/admin/growth">Growth</Link> · <Link href="/admin/learning">Learning</Link> · <Link href="/admin/core">Core</Link> · <Link href="/admin/seo">SEO</Link> · <Link href="/admin/referrals">Referrals</Link> · <Link href="/admin/trends">Trend pages</Link></p>
      </header>

      {c?.globalStop ? <p className={s.alertBad} role="alert">GLOBAL STOP IS ON — nothing that costs money runs. {c.reason}</p> : null}
      {c && !c.globalStop && c.autoPauseUntil && autoPaused ? <p className={s.alertWarn} role="status">Auto-pause active until {c.autoPauseUntil.slice(11, 16)} UTC (spend spike). {c.reason}</p> : null}

      <section className={s.grid} aria-label="Key figures">
        <div className={s.stat}><span>Users</span><b>{num(o.users?.total)}</b><small>{o.users ? `${o.users.new7d} new in 7 days · ${o.users.active24h} signed in 24 h` : "needs the database"}</small></div>
        <div className={s.stat}><span>MRR (active subscriptions)</span><b>{usd(o.revenue.mrrUsd, 0)}</b><small>{o.plans.activePaid.lite} Lite · {o.plans.activePaid.plus} Plus · {o.plans.activePaid.pro} Pro, from Whop webhooks</small></div>
        <div className={s.stat}><span>Provider spend, 30 days</span><b>{usd(o.spend.last30dUsd)}</b><small>charged cost in the Usage ledger</small></div>
        <div className={s.stat}><span>Margin estimate</span><b>{usd(o.margin.estimateUsd, 0)}</b><small>{o.margin.note}</small></div>
        <div className={s.stat}><span>Model calls, 24 h</span><b>{num(o.models.calls24h)}</b><small>{o.models.errorRate24h === null ? "none recorded" : `${(o.models.errorRate24h * 100).toFixed(1)}% errors · p50 ${ms(o.models.p50Ms)} · p95 ${ms(o.models.p95Ms)}`}</small></div>
        <div className={s.stat}><span>Spend today (UTC)</span><b>{usd(o.guard.spendToday?.totalUsd)}</b><small>cap {usd(o.guard.caps.globalUsd, 0)} · breaker: {o.guard.breakerLevel}</small></div>
        <div className={s.stat}><span>OpenRouter balance</span><b>{orBalance ? usd(orBalance.remaining) : "—"}</b><small>{orBalance ? `${orBalance.percent.toFixed(2)}% of ${usd(orBalance.totalCredits)}${orBalance.low ? " · LOW" : ""} · checked ${orBalance.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "no check recorded yet"}</small></div>
      </section>

      <TrafficRevenueCard traffic={traffic} revenue={revenue} live={live} presence={presence} />

      <section className={s.panel} aria-labelledby="controls-h">
        <h2 id="controls-h">Kill switches</h2>
        <p className={s.sub}>Server-enforced on every spend path. Changes take effect within ~5 seconds on all instances and are written to the audit log.</p>
        {c ? <AdminControls autoPaused={autoPaused} initial={{ globalStop: c.globalStop, pauseMedia: c.pauseMedia, pauseAgents: c.pauseAgents, pausePayments: c.pausePayments === true, disabledProviders: c.disabledProviders, disabledModels: c.disabledModels, autoPauseUntil: c.autoPauseUntil, reason: c.reason }} hourly={{ edit: c.hourly ?? {}, effective: { providerUsd: hl.providerUsd, modelUsd: hl.modelUsd, modelCalls: hl.modelCalls }, env: { providerUsd: envHl.providerUsd, modelUsd: envHl.modelUsd, modelCalls: envHl.modelCalls } }} /> : <p className={s.empty}>Controls could not be read from the store.</p>}
      </section>

      <section className={s.panel} aria-labelledby="hf-h">
        <h2 id="hf-h">Connect Higgsfield</h2>
        <p className={s.sub}>Default provider for video and images. Keys live in Vercel environment variables only.</p>
        <ConnectHiggsfield initial={higgsfieldAdminStatus()} />
      </section>

      <div className={s.cols}>
        <section className={s.panel}>
          <h2>Requests per minute (last 60 min)</h2>
          <Spark values={o.models.requestsPerMinute} label="Model calls per minute over the last hour" />
          <p className={s.sub}>{o.models.errors24h} failed of {o.models.calls24h} calls in 24 h{Object.keys(o.models.errorReasons).length ? ` (${Object.entries(o.models.errorReasons).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""}.</p>
        </section>
        <section className={s.panel}>
          <h2>Spend per day (14 days)</h2>
          <Spark values={o.spend.byDay.map((d) => d.usd)} label="Provider spend per day" />
          <p className={s.sub}>Free today: {usd(o.guard.spendToday?.freeUsd)} (cap {usd(o.guard.caps.freeUsd, 0)}). Admin account today: {usd(o.guard.adminSpendTodayUsd)}.</p>
        </section>
      </div>

      <div className={s.cols}>
        <section className={s.panel}>
          <h2>Plan mix</h2>
          <Table head={["Plan", "Accounts"]} rows={Object.entries(o.plans.mix).map(([k, v]) => [k, v])} />
          <p className={s.sub}>Payments last 30 days: {o.revenue.paymentsLast30d} ({usd(o.revenue.paymentsRevenueLast30dUsd, 0)} at list price). Billing events 7 d: {Object.entries(o.revenue.billingEventsLast7d).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.</p>
        </section>
        <section className={s.panel}>
          <h2>Spend by plan (30 days)</h2>
          <Table head={["Plan", "USD", "Credits", "Charges"]} rows={o.spend.byPlan.map((r) => [r.key, usd(r.usd), num(r.units), num(r.n)])} />
        </section>
      </div>

      <section className={s.panel}>
        <h2>Spend by feature (30 days)</h2>
        <Table head={["Feature", "USD", "Credits", "Charges"]} rows={o.spend.byFeature.map((r) => [r.key, usd(r.usd), num(r.units), num(r.n)])} />
      </section>

      <div className={s.cols}>
        <section className={s.panel}>
          <h2>Model usage (24 h)</h2>
          <Table head={["Model", "Calls", "Errors", "USD", "p50", "p95"]} rows={o.models.byModel.map((r) => [r.key, r.calls, r.errors, usd(r.usd, 4), ms(r.p50), ms(r.p95)])} empty="No model calls recorded in the last 24 hours." />
        </section>
        <section className={s.panel}>
          <h2>Providers (24 h)</h2>
          <Table head={["Provider", "Calls", "Errors", "USD", "p50", "p95"]} rows={o.models.byProvider.map((r) => [r.key, r.calls, r.errors, usd(r.usd, 4), ms(r.p50), ms(r.p95)])} empty="No provider calls recorded in the last 24 hours." />
        </section>
        <section className={s.panel}>
          <h2>This hour vs hourly limits</h2>
          <Table head={["Scope", "Name", "USD", "Calls", "Limit"]} rows={hourly.map((r) => [r.kind, r.name, usd(r.usd, 4), r.calls, r.kind === "provider" ? `$${hl.providerUsd}/h` : `$${hl.overrides[r.name]?.usd ?? hl.modelUsd}/h, ${hl.overrides[r.name]?.calls ?? hl.modelCalls} calls/h`])} empty="No live calls this hour." />
        </section>
      </div>

      <section className={s.panel}>
        <h2>Top spenders (30 days, masked)</h2>
        <Table head={["Account", "Plan", "USD", "Credits", "Charges"]} rows={o.spend.topUsers.map((r) => [r.user, r.plan, usd(r.usd), num(r.units), num(r.n)])} />
      </section>

      <section className={s.panel}>
        <h2>Inquiries</h2>
        {o.inquiries ? (
          <>
            <p className={s.sub}>{o.inquiries.total} total · {o.inquiries.last7d} in 7 days · {o.inquiries.emailFailed} with a failed notification email.</p>
            <Table head={["Received (UTC)", "Name", "Company", "Email", "Notified"]} rows={o.inquiries.recent.map((r) => [r.at.slice(0, 16).replace("T", " "), r.name, r.company || "—", r.email, r.emailStatus])} empty="No inquiries yet." />
          </>
        ) : <p className={s.empty}>Needs the database.</p>}
      </section>

      <section className={s.panel}>
        <h2>Admin audit log</h2>
        <Table head={["When (UTC)", "Actor", "Action", "Detail"]} rows={o.audit.slice(0, 40).map((a) => [a.at.slice(0, 16).replace("T", " "), a.actor, a.action, a.detail])} empty="No admin actions recorded yet." />
      </section>

      <section className={s.panel}>
        <h2>Setup status</h2>
        <p className={s.sub}>Names only; values are never shown. Store: {o.system.storeDurable ? "durable" : "NOT durable"}.</p>
        <Table head={["Setting", "What it enables", "State"]} rows={o.system.keys.map((k) => [k.name, k.label, k.set ? "set" : "not set up"])} />
      </section>
    </div>
  );
}
