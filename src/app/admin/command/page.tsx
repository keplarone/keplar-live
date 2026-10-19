import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { growthDashboard } from "@/lib/growth/dashboard";
import { EXPERIMENTS, runningIds } from "@/lib/growth/experiments";
import { growthControls, latestOk, recentRuns } from "@/lib/growth/ops/runner";
import { GROWTH_JOBS } from "@/lib/growth/ops/jobs";
import { mrrSeries, retentionBetween, snapshotOnOrBefore } from "@/lib/growth/ops/revenue";
import { PLATFORMS, REGISTRY_VERSION, REGISTRY_EVIDENCE, listSubmissions, planFor } from "@/lib/growth/ops/leaderboards";
import { allWatched } from "@/lib/growth/ops/watch";
import { geoByWeek, geoRows, GEO_PROMPTS_VERSION } from "@/lib/growth/ops/visibility";
import { listContent } from "@/lib/growth/ops/content";
import { latestReport } from "@/lib/growth/ops/reports";
import type { AuditResult } from "@/lib/growth/ops/seo-audit";
import type { Cohort } from "@/lib/growth/ops/retention";
import { ContentActions, GrowthPause, JobActions, NewDraft, ReviewedButton, SubmissionActions } from "@/components/admin/GrowthOpsActions";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

const NA = "Unavailable";
const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };
const usd = (n: number | null | undefined) => (n === null || n === undefined ? NA : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? NA : n.toLocaleString("en-US"));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? NA : `${(x * 100).toFixed(1)}%`);
const when = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "Never");
const tri = (v: boolean | null) => (v === null ? "Unknown" : v ? "Yes" : "No");

/** A number with where it came from. Every metric on this page names its source; a missing source shows "Unavailable". */
function Stat({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className={s.stat}>
      <span>{label}</span>
      <b>{value}</b>
      <small>Source: {source}</small>
    </div>
  );
}

/**
 * Keplar Command Center: the growth, visibility, competitive, automation and financial view in one place. Admin only (404 for
 * everyone else). Read-only apart from the job, content and submission controls, which go through /api/admin/growth-ops (audited).
 */
export default async function CommandCenterPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [dash, controls, runs, series, snap, snap30, submissions, watched, geoWeeks, content, weekly, seoRun, usageRun] = await Promise.all([
    safe(() => growthDashboard(30), null),
    safe(() => growthControls(), null),
    safe(() => recentRuns(40), []),
    safe(() => mrrSeries(90), []),
    safe(() => snapshotOnOrBefore(today), null),
    safe(() => snapshotOnOrBefore(new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10)), null),
    safe(() => listSubmissions(), []),
    safe(() => allWatched(), []),
    safe(() => geoByWeek(), []),
    safe(() => listContent(), []),
    safe(() => latestReport("weekly"), null),
    safe(() => latestOk("seo-audit"), null),
    safe(() => latestOk("usage-retention"), null),
  ]);
  const ret = snap && snap30 && snap.date !== snap30.date ? retentionBetween(snap30, snap) : null;
  const lastGeo = geoWeeks.at(-1) ?? null;
  const geoLatest = lastGeo ? await safe(() => geoRows().list("system", (r) => r.week === lastGeo.week), []) : [];
  const seo = seoRun?.data as unknown as AuditResult | undefined;
  const usage = usageRun?.data as { dau: number; wau: number; mau: number; cohorts: Cohort[] } | undefined;
  const subBy = new Map(submissions.map((x) => [x.platformId, x]));
  const plans = PLATFORMS.map((p) => ({ p, plan: planFor(p), sub: subBy.get(p.id) }));
  const changed = watched.filter((w) => w.changedAt && !w.reviewedAt);
  const lastRun = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastRun.has(r.job)) lastRun.set(r.job, r);
  const failed7 = runs.filter((r) => r.status === "failed" && Date.parse(r.finishedAt ?? r.at) > now.getTime() - 7 * 864e5).length;
  const running = runningIds();
  const m = dash?.money;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · Command Center · {when(now.toISOString())}</p>
        <h1>Keplar Command Center</h1>
        <p className={s.sub}>
          Measured data only. Every number names its source; anything not measured says &ldquo;{NA}&rdquo;. Usage counts are consenting browsers only (a floor). Revenue is recorded billing state at the price Whop bills, not accounting data. Jobs run from Vercel Cron daily (weekly jobs on Mondays, monthly on the 1st); see Automation below.
        </p>
      </header>

      {failed7 ? <p className={s.alertBad} role="alert">{failed7} growth job run(s) failed in the last 7 days. See Automation.</p> : null}
      {changed.length ? <p className={s.alertWarn}>{changed.length} watched page(s) changed and need a review. See Competitive Intelligence and Leaderboards.</p> : null}

      <section className={s.grid} aria-label="Overview">
        <Stat label="MRR (billed price)" value={usd(snap?.mrrUsd ?? m?.mrrBilledUsd)} source={snap ? `growth_sub_daily ${snap.date}` : "accounts_workspaces (live)"} />
        <Stat label="Paying customers" value={num(snap ? Object.keys(snap.customers).length : m?.payingCustomers)} source={snap ? "growth_sub_daily" : "accounts_workspaces"} />
        <Stat label="Net revenue retention, 30 days" value={pct(ret?.netRevenueRetention)} source={ret ? `snapshots ${ret.from} to ${ret.to}` : "needs two snapshots 30 days apart"} />
        <Stat label="Customer churn, 30 days" value={pct(ret?.customerChurnRate)} source={ret ? `snapshots ${ret.from} to ${ret.to}` : "needs two snapshots 30 days apart"} />
        <Stat label="Weekly active browsers" value={num(usage?.wau)} source={usage ? `growth_events, run ${usageRun!.period}` : "usage-retention job not run yet"} />
        <Stat label="SEO errors on checked pages" value={seo ? `${seo.counts.error} of ${seo.checked} pages` : NA} source={seoRun ? `seo-audit ${seoRun.period}` : "seo-audit not run yet"} />
        <Stat label="AI answers citing keplar.one" value={lastGeo ? `${lastGeo.cited} of ${lastGeo.asked}` : NA} source={lastGeo ? `growth_geo_results ${lastGeo.week} (API)` : "ai-visibility needs a key and a budget"} />
        <Stat label="Leaderboard listings" value={`${submissions.filter((x) => x.status === "listed").length} listed, ${submissions.filter((x) => x.status === "submitted").length} pending`} source="growth_submissions (recorded by a person)" />
      </section>

      <section className={s.panel} aria-labelledby="lb-h">
        <h2 id="lb-h">Leaderboard Intelligence</h2>
        <p className={s.sub}>Registry {REGISTRY_VERSION}, compiled 2026-10-19 from {REGISTRY_EVIDENCE === "search-snippet" ? "web-search results quoting each source (the pages themselves were not opened); confirm on the page before relying on a fact" : "the platforms' pages"}. &ldquo;Unknown&rdquo; means nobody could confirm it. Nothing is submitted automatically: each is a task for a person, recorded here.</p>
        <div className={s.scroll}>
          <table className={`${s.table} ${s.wide}`}>
            <thead><tr><th scope="col">Platform</th><th scope="col">Ranks</th><th scope="col">Route</th><th scope="col">Pay</th><th scope="col">Blockers</th><th scope="col">Status</th><th scope="col">Next step</th><th scope="col">Record</th></tr></thead>
            <tbody>
              {plans.map(({ p, plan, sub }) => (
                <tr key={p.id}>
                  <td><a href={p.url} rel="noopener noreferrer" target="_blank">{p.name}</a><br /><small>{p.methodology.slice(0, 120)}</small></td>
                  <td className={s.nowrap}>{p.ranksWhat}</td>
                  <td className={s.nowrap}>{plan.route}</td>
                  <td className={s.nowrap}>{tri(p.requiresPayment)}</td>
                  <td>{plan.blockers.join(", ")}</td>
                  <td className={s.nowrap}>{sub ? `${sub.status.replace("_", " ")}${sub.listingUrl ? ` (${sub.listingUrl})` : ""}` : "not started"}</td>
                  <td>{plan.nextStep}</td>
                  <td>{plan.route === "not-applicable" ? "—" : <SubmissionActions platformId={p.id} status={sub?.status ?? "not_started"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="vis-h">
          <h2 id="vis-h">AI Visibility</h2>
          <p className={s.sub}>Prompt set {GEO_PROMPTS_VERSION}, asked once a week through an answer-engine API. API answers can differ from the consumer apps; they are not a ranking.</p>
          {geoWeeks.length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Week</th><th scope="col">Asked</th><th scope="col">Mentioned</th><th scope="col">Cited</th></tr></thead>
                <tbody>{geoWeeks.slice(-8).map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.asked}</td><td>{w.mentioned}</td><td>{w.cited}</td></tr>)}</tbody>
              </table>
              {geoLatest.length ? <p className={s.sub}>Latest week by prompt: {geoLatest.map((g) => `${g.promptId} ${g.mentioned ? "mentioned" : "—"}${g.cited ? ", cited" : ""}`).join(" · ")}</p> : null}
            </div>
          ) : <p className={s.empty}>{NA}: not measured yet. Needs an answer-engine key and KEPLAR_GEO_WEEKLY_USD above $0 (about $0.15 a week).</p>}
          <p className={s.sub}>Visits from AI answer engines (consenting browsers, 30 days): {dash ? num(dash.funnel.bySource.ai ?? 0) : NA}. Search Console data: {NA} (not connected).</p>
        </section>

        <section className={s.panel} aria-labelledby="ci-h">
          <h2 id="ci-h">Competitive Intelligence</h2>
          <p className={s.sub}>Official pricing and release-notes pages, read once a week (robots.txt respected). A change is a fact (the page text differs); what it means is for a reviewer.</p>
          {watched.filter((w) => w.group === "competitor").length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Page</th><th scope="col">Last read</th><th scope="col">Status</th><th scope="col">Changed</th><th scope="col"></th></tr></thead>
                <tbody>
                  {watched.filter((w) => w.group === "competitor").sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? "")).map((w) => (
                    <tr key={w.id}>
                      <td><a href={w.url} rel="noopener noreferrer" target="_blank">{w.owner} {w.kind}</a></td>
                      <td>{when(w.lastCheckedAt)}</td>
                      <td>{String(w.lastStatus)}</td>
                      <td>{w.changedAt ? `${when(w.changedAt)}${w.reviewedAt ? " (reviewed)" : ""}` : "No change"}</td>
                      <td>{w.changedAt && !w.reviewedAt ? <ReviewedButton id={w.id} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.empty}>{NA}: the page-watch job hasn&rsquo;t run yet (Mondays).</p>}
        </section>
      </div>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="ga-h">
          <h2 id="ga-h">Growth Analytics</h2>
          {dash ? (
            <table className={s.table}>
              <tbody>
                {dash.funnel.steps.map((x) => <tr key={x.label}><td>{x.label}</td><td className={s.nowrap}>{num(x.browsers)}</td></tr>)}
                <tr><td>Visits by source</td><td>{Object.entries(dash.funnel.bySource).map(([k, v]) => `${k} ${v}`).join(" · ") || NA}</td></tr>
              </tbody>
            </table>
          ) : <p className={s.empty}>{NA}</p>}
          <p className={s.sub}>Source: seo_events and growth_events, last 30 days, consenting browsers. Per-page detail: <Link href="/admin/seo">Search to activation</Link>, <Link href="/admin/growth">Growth</Link>.</p>
          <h2>Weekly cohorts (browsers by first question)</h2>
          {usage?.cohorts?.length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Cohort</th><th scope="col">Size</th>{usage.cohorts[0].retained.map((_, i) => <th scope="col" key={i}>W{i}</th>)}</tr></thead>
                <tbody>{usage.cohorts.slice(-8).map((c) => <tr key={c.week}><td>{c.week}</td><td>{c.size}</td>{c.retained.map((r, i) => <td key={i}>{r === null ? "" : pct(r)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : <p className={s.empty}>{NA}: the usage-retention job runs on Mondays.</p>}
        </section>

        <section className={s.panel} aria-labelledby="fin-h">
          <h2 id="fin-h">Financial Performance</h2>
          <table className={s.table}>
            <tbody>
              <tr><td>MRR (billed price)</td><td>{usd(snap?.mrrUsd ?? m?.mrrBilledUsd)}</td></tr>
              <tr><td>ARR (MRR × 12)</td><td>{snap ? usd(Math.round(snap.mrrUsd * 12 * 100) / 100) : NA}</td></tr>
              <tr><td>Gross revenue retention, 30 days</td><td>{pct(ret?.grossRevenueRetention)}</td></tr>
              <tr><td>Upgrades / downgrades, 30 days</td><td>{ret ? `${ret.upgrades} / ${ret.downgrades}` : NA}</td></tr>
              <tr><td>Cash collected, 30 days</td><td>{usd(m?.cashCollected30Usd)}</td></tr>
              <tr><td>Refunds / disputes, 30 days</td><td>{m ? `${m.refunds30} / ${m.disputes30}` : NA}</td></tr>
              <tr><td>Contribution after serving users, 30 days</td><td>{usd(m?.contribution30Usd)}</td></tr>
              <tr><td>CAC</td><td>{m?.marketingSpendRecordedUsd === 0 ? "Not defined ($0 marketing spend recorded)" : NA}</td></tr>
              <tr><td>Lifetime value</td><td>{NA} (needs 3+ months of churn data)</td></tr>
            </tbody>
          </table>
          <p className={s.sub}>Sources: growth_sub_daily (snapshots), whop_payments, billing_events, compute_ledger. Costs by feature: <Link href="/admin/profitability">Profitability</Link>.</p>
          {series.length ? <div className={s.spark} aria-label={`MRR over ${series.length} days`}>{series.map((p) => <span key={p.date} title={`${p.date}: $${p.mrrUsd}`} style={{ height: `${Math.max(2, (p.mrrUsd / Math.max(1, ...series.map((x) => x.mrrUsd))) * 100)}%` }} />)}</div> : null}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="seo-h">
        <h2 id="seo-h">SEO health</h2>
        {seo ? (
          <>
            <p className={s.sub}>{seo.checked} of {seo.sitemapUrls} sitemap URLs checked on {seoRun!.period} (rotating daily): {seo.counts.error} errors, {seo.counts.warning} warnings, {seo.counts.notice} notices.</p>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Severity</th><th scope="col">Issue</th><th scope="col">Page</th><th scope="col">Detail</th></tr></thead>
                <tbody>{seo.issues.filter((i) => i.severity !== "notice").slice(0, 30).map((i, k) => <tr key={k}><td>{i.severity}</td><td>{i.code}</td><td>{i.url.replace(/^https?:\/\/[^/]+/, "")}</td><td>{i.detail}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : <p className={s.empty}>{NA}: the seo-audit job hasn&rsquo;t run yet.</p>}
      </section>

      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="content-h">
          <h2 id="content-h">Content Operations</h2>
          <p className={s.sub}>Drafts need a source on every factual claim and a reviewer other than the author. Nothing is posted automatically; &ldquo;published&rdquo; records where a person posted it.</p>
          {content.length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Item</th><th scope="col">Status</th><th scope="col">Claims sourced</th><th scope="col"></th></tr></thead>
                <tbody>{content.slice(0, 20).map((c) => (
                  <tr key={c.id}>
                    <td>{c.channel}: {c.title}<br /><small>by {c.author}{c.approvedBy ? `, approved by ${c.approvedBy}` : ""}{c.publishedUrl ? `, ${c.publishedUrl}` : ""}</small></td>
                    <td>{c.status.replace("_", " ")}</td>
                    <td>{c.claims.filter((x) => x.source).length} of {c.claims.length}</td>
                    <td><ContentActions id={c.id} status={c.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className={s.empty}>No drafts yet.</p>}
          <h2>New draft</h2>
          <NewDraft />
        </section>

        <section className={s.panel} aria-labelledby="exp-h">
          <h2 id="exp-h">Experimentation</h2>
          <table className={s.table}>
            <thead><tr><th scope="col">Experiment</th><th scope="col">Running</th><th scope="col">Arms</th></tr></thead>
            <tbody>{EXPERIMENTS.map((e) => <tr key={e.id}><td>{e.id}</td><td>{running.has(e.id) ? "Yes" : "No"}</td><td>{e.arms.map((a) => a.label).join(" / ")}</td></tr>)}</tbody>
          </table>
          <p className={s.sub}>Results, p-values, guardrails and sample-ratio checks: <Link href="/admin/experiments">Experiments</Link>. A winner is never declared automatically.</p>
          <h2>Latest weekly report</h2>
          {weekly ? (
            <>
              <p className={s.sub}>{weekly.period}, built {when(weekly.createdAt)}</p>
              <ul className={s.sub}>{weekly.attention.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </>
          ) : <p className={s.empty}>{NA}: the first report is built on the next Monday run.</p>}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="auto-h">
        <h2 id="auto-h">Automation Center</h2>
        <p className={s.sub}>Vercel Cron calls /api/cron/growth daily at 08:19 UTC. Each job runs once per period, with a timeout, one retry and an owner alert on failure. Jobs that spend money stay off until their budget is set. Controls are audited.</p>
        {controls ? <GrowthPause paused={controls.paused} /> : <p className={s.empty}>{NA}</p>}
        <div className={s.scroll}>
          <table className={s.table}>
            <thead><tr><th scope="col">Job</th><th scope="col">Cadence</th><th scope="col">Last run</th><th scope="col">Result</th><th scope="col">Spend</th><th scope="col"></th></tr></thead>
            <tbody>{GROWTH_JOBS.map((j) => {
              const r = lastRun.get(j.id);
              return (
                <tr key={j.id}>
                  <td>{j.label}<br /><small>{j.description}</small></td>
                  <td className={s.nowrap}>{j.cadence}</td>
                  <td>{r ? `${r.period}, ${when(r.finishedAt ?? r.at)}` : "Never"}</td>
                  <td>{r ? `${r.status ?? r.result}: ${r.summary ?? ""}` : "—"}</td>
                  <td>{r?.costUsd ? usd(r.costUsd) : "$0"}</td>
                  <td className={s.nowrap}><JobActions job={j.id} paused={Boolean(controls?.pausedJobs.includes(j.id))} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
