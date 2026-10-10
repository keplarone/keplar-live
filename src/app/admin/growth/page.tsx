import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { growthDashboard } from "@/lib/growth/dashboard";
import { recentFeedback } from "@/lib/growth/feedback";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

const NO = "No data yet";
const usd = (n: number | null | undefined) => (n === null || n === undefined ? NO : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? NO : n.toLocaleString("en-US"));
const secs = (n: number | null | undefined) => (n === null || n === undefined ? NO : `${n}s`);
const pct = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || !b ? NO : `${Math.round((a / b) * 100)}%`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={s.stat}>
      <span>{label}</span>
      <b>{value}</b>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/** Growth view: qualified visits, activation, repeat use, paying customers, MRR, churn, refunds, CAC, contribution. Admin only. */
export default async function AdminGrowthPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const d = await growthDashboard(30);
  const fb = await recentFeedback(20, 30).catch(() => []);
  const a = d.asks;
  const m = d.money;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · Growth · last {d.windowDays} days · {d.generatedAt.replace("T", " ").slice(0, 16)} UTC</p>
        <h1>Growth</h1>
        <p className={s.sub}>
          Real data only; anything not recorded says &ldquo;{NO}&rdquo;. Visit, activation and usage counts come from visitors who allowed Analytics (and send no Global Privacy Control or Do Not Track signal), so they are a floor, not a total. Money comes from Whop webhooks and the credits ledger. Search impressions and rankings live in Google Search Console. See <Link href="/admin/seo">Search to activation</Link> for per-page detail and docs/growth/ for the definitions.
        </p>
      </header>

      <section className={s.grid} aria-label="Headline numbers">
        <Stat label="Qualified visits" value={num(d.funnel.steps[0].browsers)} note="Distinct consenting browsers that opened a public page" />
        <Stat label="Sign-ups" value={num(d.users?.new30)} note={d.users ? `${num(d.users.total)} accounts in total; ${num(d.users.new7)} in the last 7 days` : "Database not connected"} />
        <Stat label="Activated browsers" value={num(a?.activatedBrowsers)} note={a ? `${pct(a.activatedBrowsers, a.browsersWithAnswer)} of browsers that got an answer` : "Waiting for consenting visitors"} />
        <Stat label="Repeat use" value={num(a?.repeatBrowsers)} note="Browsers with answers on 2+ different days" />
        <Stat label="Paying customers" value={num(m.payingCustomers)} note={`Lite ${m.activePaid.lite} · Plus ${m.activePaid.plus} · Pro ${m.activePaid.pro}`} />
        <Stat label="MRR (as billed)" value={usd(m.mrrBilledUsd)} note="Active subscriptions x the Whop price ($19.99 / $44.99 / $99.99). Not counting lifetime or one-time sales." />
        <Stat label="Churn (30 days)" value={m.payingCustomers + m.cancellations30 >= 10 ? pct(m.cancellations30, m.payingCustomers + m.cancellations30) : NO} note={`${m.cancellations30} cancelled, ${m.cancelScheduled} scheduled to end. A rate needs at least 10 customers.`} />
        <Stat label="Refunds / disputes" value={`${m.refunds30} / ${m.disputes30}`} note="Counts from Whop events in 30 days" />
        <Stat label="CAC" value={m.marketingSpendRecordedUsd === 0 ? "Not defined" : NO} note="No marketing spend is recorded ($0 budget), so cost per customer cannot be computed." />
        <Stat label="Contribution after serving users" value={usd(m.contribution30Usd)} note="Cash collected, minus estimated Whop card fees, minus provider cost. Excludes hosting, database, email and the founders' time." />
      </section>

      <section className={s.panel} aria-labelledby="funnel-h">
        <h2 id="funnel-h">Funnel (distinct consenting browsers)</h2>
        {d.funnel.steps.every((x) => x.browsers === null) ? (
          <p className={s.empty}>{NO}. Counts appear after visitors allow Analytics.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Step</th><th scope="col">Browsers</th><th scope="col">of the first step</th></tr></thead>
              <tbody>
                {d.funnel.steps.map((x) => (
                  <tr key={x.label}><td>{x.label}</td><td>{num(x.browsers)}</td><td>{pct(x.browsers, d.funnel.steps[0].browsers)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {Object.keys(d.funnel.bySource).length ? <p className={s.sub}>Visits by source: {Object.entries(d.funnel.bySource).map(([k, v]) => `${k} ${v}`).join(" · ")}</p> : null}
      </section>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="ask-h">
          <h2 id="ask-h">Asking and time to first result</h2>
          {!a ? (
            <p className={s.empty}>{NO}.</p>
          ) : (
            <div className={s.scroll}>
              <table className={s.table}>
                <tbody>
                  <tr><td>Questions started</td><td>{num(a.asksStarted)}</td></tr>
                  <tr><td>Answers shown</td><td>{num(a.asksDone)}</td></tr>
                  <tr><td>Ended in an error, limit or stop</td><td>{num(a.asksFailed)}{Object.keys(a.errorKinds).length ? ` (${Object.entries(a.errorKinds).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}</td></tr>
                  <tr><td>Left without an answer (3+ minutes, no end)</td><td>{num(a.asksAbandoned)}</td></tr>
                  <tr><td>Median / slowest-10% seconds to answer</td><td>{secs(a.medianSecs)} / {secs(a.p90Secs)}</td></tr>
                  <tr><td>Answers that used several models</td><td>{a.multiModelShare === null ? NO : `${Math.round(a.multiModelShare * 100)}%`}</td></tr>
                  <tr><td>Multi-model answers with a visible disagreement</td><td>{a.disagreementShare === null ? NO : `${Math.round(a.disagreementShare * 100)}%`}</td></tr>
                  <tr><td>Looked closer / copied / shared / retried</td><td>{Object.entries(a.actions).map(([k, v]) => `${k.replace("open_", "")} ${v}`).join(" · ") || NO}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={s.panel} aria-labelledby="money-h">
          <h2 id="money-h">Money (30 days)</h2>
          <div className={s.scroll}>
            <table className={s.table}>
              <tbody>
                <tr><td>Payments</td><td>{m.payments30 ? num(m.payments30) : NO}</td></tr>
                <tr><td>Cash collected (as billed)</td><td>{m.payments30 ? usd(m.cashCollected30Usd) : NO}</td></tr>
                <tr><td>Estimated Whop card fees (2.7% + $0.30)</td><td>{m.payments30 ? usd(m.estimatedFees30Usd) : NO}</td></tr>
                <tr><td>Provider cost of paid usage</td><td>{usd(m.providerSpend30Usd)}</td></tr>
                <tr><td>Failed payments</td><td>{num(m.failedPayments30)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="share-h">
          <h2 id="share-h">Sharing (consented links)</h2>
          {d.shares ? <p>{d.shares.created} created, {d.shares.live} live, {d.shares.views} page views (includes link-preview fetches).</p> : <p className={s.empty}>{NO}.</p>}
        </section>
        <section className={s.panel} aria-labelledby="fb-h">
          <h2 id="fb-h">Feedback (30 days)</h2>
          {d.feedback && Object.keys(d.feedback).length ? <p>{Object.entries(d.feedback).map(([k, v]) => `${k} ${v}`).join(" · ")}</p> : <p className={s.empty}>{NO}.</p>}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="msgs-h">
        <h2 id="msgs-h">Latest feedback</h2>
        {fb.length === 0 ? (
          <p className={s.empty}>{NO}.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">When (UTC)</th><th scope="col">Kind</th><th scope="col">Who</th><th scope="col">Text</th></tr></thead>
              <tbody>
                {fb.map((r) => (
                  <tr key={r.id}>
                    <td>{r.at.slice(0, 16).replace("T", " ")}</td>
                    <td>{r.kind}</td>
                    <td>{[r.role, r.plan, r.email ? r.email : r.signedIn ? "signed in" : "anonymous"].filter(Boolean).join(" · ")}</td>
                    <td>{(r.message || Object.entries(r.answers ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | ")).slice(0, 400)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
