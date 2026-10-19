import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { DRIFT, deploymentVersion, observatorySnapshot, type ModelStats, type ObservatorySnapshot } from "@/lib/ops/observatory";
import { REUSE, reuseDays } from "@/lib/reuse/cache";
import { cronStatus, healthSummary } from "@/lib/ops/health";
import { collectSignals, listIncidents, SEV_LABEL } from "@/lib/ops/incidents";
import { sentryConfigured } from "@/lib/ops/errors";
import { circuitSnapshot } from "@/lib/orchestration/circuit";
import { lastReconciliation } from "@/lib/billing/reconcile";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const ms = (n: number | null) => (n === null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`);
const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(n < 0.01 ? 5 : 3)}`);
const delta = (cur: number | null, base: number | null) => (cur === null || base === null ? "" : ` (${cur >= base ? "+" : ""}${((cur - base) * 100).toFixed(1)} pts)`);

const when = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "—");
const STATE_LABEL: Record<string, string> = { ok: "OK", late: "Late", failed: "Failed", never: "Never ran" };

/**
 * Keplar Reliability Center: service health, incidents, live signals, scheduled jobs, billing reconciliation, model drift and
 * per-feature reliability. Every figure comes from telemetry the product records; what is not measured says so.
 */
export default async function AdminReliabilityPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [snap, reused, health, signals, incidents, crons, reconcile] = await Promise.all([
    observatorySnapshot().catch(() => null),
    reuseDays(7).catch(() => null),
    healthSummary().catch(() => null),
    collectSignals().catch(() => null),
    listIncidents(14).catch(() => null),
    cronStatus().catch(() => null),
    lastReconciliation().catch(() => null),
  ]);
  const open = incidents?.filter((i) => i.status === "open") ?? [];
  const recent = incidents?.filter((i) => i.status === "resolved").slice(0, 15) ?? [];
  const circuits = circuitSnapshot();
  const v = deploymentVersion();
  const reconcileTotal = reconcile ? Object.values(reconcile.counts).reduce((t, n) => t + n, 0) : null;
  const answers = signals?.answers;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · Keplar Reliability Center · real telemetry only</p>
        <h1>Reliability</h1>
        <p className={s.sub}>
          Health, incidents and live signals from the last 15 minutes; model drift and features over the last 24 h against the 7 days before. Nothing here changes routing or people&apos;s chosen models.
          Deployment: {v.commit ?? "unknown"}{v.ref ? ` (${v.ref})` : ""}{v.env ? ` · ${v.env}` : ""}. <Link href="/admin">Operations</Link> · <Link href="/admin/flight">Flight recorder</Link> · <Link href="/admin/errors">Errors</Link> · <Link href="/admin/security">Security</Link> · <Link href="/admin/costs">Costs</Link>
        </p>
      </header>

      {open.some((i) => i.sev <= 2) ? <p className={s.alertBad} role="alert">{open.filter((i) => i.sev <= 2).length} major incident{open.filter((i) => i.sev <= 2).length === 1 ? "" : "s"} open: {open.filter((i) => i.sev <= 2).map((i) => `${SEV_LABEL[i.sev]} ${i.title}`).join("; ")}</p> : null}

      <section aria-label="Service health">
        <h2>Service health</h2>
        <div className={s.grid}>
          <div className={s.stat}><span>Health check</span><b>{health ? (health.status === 200 ? "OK" : "Failing") : "—"}</b><small>{health ? `${health.body.store === "postgres" ? `Database round trip ${"roundTripMs" in health.body ? `${health.body.roundTripMs} ms` : ""}` : "File store (no database configured)"}${health.body.error ? ` · ${health.body.error}` : ""}` : "Could not run the health check."}</small></div>
          <div className={s.stat}><span>Answer success, 15 min</span><b>{answers && answers.judged ? pct((answers.judged - answers.failed) / answers.judged) : "—"}</b><small>{answers ? `${answers.judged - answers.failed} of ${answers.judged} answer requests (cancels and plan limits excluded)` : "Could not read flight records."}</small></div>
          <div className={s.stat}><span>Server errors, 15 min</span><b>{signals ? (signals.errors.server ?? 0) + (signals.errors.render ?? 0) + (signals.errors.job ?? 0) : "—"}</b><small>{signals ? `Browser errors: ${signals.errors.client ?? 0}` : "Could not read error counts."}</small></div>
          <div className={s.stat}><span>Inference spend today</span><b>{signals?.spend.todayUsd != null ? `$${signals.spend.todayUsd.toFixed(2)}` : "—"}</b><small>{signals ? `Cap $${signals.spend.capUsd.toFixed(2)} · last hour ${signals.spend.lastHourUsd != null ? `$${signals.spend.lastHourUsd.toFixed(2)}` : "—"}` : ""}</small></div>
          <div className={s.stat}><span>Alert routing</span><b>{signals?.alertsRouted ? "Email + webhook" : "Email only"}</b><small>{sentryConfigured() ? "Errors also forwarded to Sentry." : "Sentry not configured (SENTRY_DSN)."}</small></div>
        </div>
      </section>

      <section aria-label="Incidents">
        <h2>Incidents</h2>
        <p className={s.sub}>Opened by the incident sweep (<code>/api/cron/incidents</code>: every 5 minutes through Inngest or the GitHub ops monitor when configured, daily through Vercel Cron). SEV-1 critical outage · SEV-2 major degradation · SEV-3 limited impact · SEV-4 minor. Runbooks: <code>docs/runbooks</code>.</p>
        {incidents === null ? <p className={s.empty}>Could not read incidents.</p> : !open.length ? <p className={s.empty}>No open incidents.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Severity</th><th scope="col">Incident</th><th scope="col">Service</th><th scope="col">First / last seen</th><th scope="col">Evidence</th><th scope="col">Request ids</th></tr></thead>
              <tbody>{open.map((i) => <tr key={i.id}><td>{SEV_LABEL[i.sev]}</td><td>{i.title}</td><td>{i.service}</td><td>{when(i.firstAt)} / {when(i.lastAt)}</td><td>{i.evidence.join(" ")}</td><td>{i.traceIds.length ? i.traceIds.map((t) => <span key={t}><Link href={`/admin/flight?req=${encodeURIComponent(t)}`}>{t}</Link> </span>) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {recent.length ? (
          <details>
            <summary>Resolved in the last 14 days ({recent.length})</summary>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th scope="col">Severity</th><th scope="col">Incident</th><th scope="col">Opened</th><th scope="col">Resolved</th></tr></thead>
                <tbody>{recent.map((i) => <tr key={i.id}><td>{SEV_LABEL[i.sev]}</td><td>{i.title}</td><td>{when(i.firstAt)}</td><td>{when(i.resolvedAt)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        ) : null}
      </section>

      <section aria-label="Providers, last 15 minutes">
        <h2>Model providers, last 15 minutes</h2>
        {!signals ? <p className={s.empty}>Could not read provider calls.</p> : !signals.providers.length ? <p className={s.empty}>No provider calls in the last 15 minutes.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Provider</th><th scope="col">Calls</th><th scope="col">Failed</th><th scope="col">Timeouts</th><th scope="col">Rate-limited</th><th scope="col">p95 / 24 h p95</th></tr></thead>
              <tbody>{signals.providers.map((p) => <tr key={p.provider}><td>{p.provider}</td><td>{p.calls}</td><td>{p.failed} ({pct(p.calls ? p.failed / p.calls : null)})</td><td>{p.timeouts}</td><td>{p.rateLimited}</td><td>{ms(p.p95Ms)} / {ms(p.baselineP95Ms)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>Circuit breakers (this server instance only; each instance learns about an outage from its own calls): {circuits.length ? circuits.map((c) => `${c.key} ${c.state}${c.consecutiveFailures ? ` (${c.consecutiveFailures} failures)` : ""}`).join(" · ") : "none tripped."}</p>
      </section>

      <section aria-label="Webhooks and billing">
        <h2>Webhooks and billing, last 2 hours</h2>
        {!signals ? <p className={s.empty}>Could not read webhook counts.</p> : !signals.webhooks.length ? <p className={s.empty}>No webhook deliveries recorded in the last 2 hours.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Provider</th><th scope="col">Processed</th><th scope="col">Failed (sender retries)</th><th scope="col">Rejected (signature or config)</th></tr></thead>
              <tbody>{signals.webhooks.map((w) => <tr key={w.provider}><td>{w.provider}</td><td>{w.ok}</td><td>{w.failed}</td><td>{w.rejected}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>Subscription reconciliation (daily, report only): {reconcile ? `${when(reconcile.at)}, ${reconcile.checked} workspaces checked, ${reconcileTotal} record${reconcileTotal === 1 ? "" : "s"} to review${reconcileTotal ? ` (${Object.entries(reconcile.counts).map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}.` : "has not run yet."}</p>
      </section>

      <section aria-label="Scheduled jobs">
        <h2>Scheduled jobs</h2>
        {!crons ? <p className={s.empty}>Could not read job heartbeats.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Job</th><th scope="col">State</th><th scope="col">Last success</th></tr></thead>
              <tbody>{crons.map((c) => <tr key={c.name}><td>{c.label}</td><td>{STATE_LABEL[c.state] ?? c.state}</td><td>{when(c.lastOkAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Not measured here">
        <h2>Not measured in the app</h2>
        <p className={s.sub}>Backup verification: no restore test is recorded by the app; follow <code>docs/runbooks/backup-restore.md</code> and record the result in <code>docs/reliability/production-certification.md</code>. Automated test results and deployments: GitHub Actions (CI, Ops monitor) and the Vercel dashboard; the live commit is shown above and at <code>/deploy-stamp.json</code>. External uptime: the GitHub ops monitor probes <code>/api/health</code> every 5 minutes.</p>
      </section>

      {!snap ? <p className={s.empty}>Could not read model calls or flight records for drift and feature scorecards.</p> : <Observatory snap={snap} reused={reused} />}
    </div>
  );
}

function Observatory({ snap, reused }: { snap: ObservatorySnapshot; reused: Awaited<ReturnType<typeof reuseDays>> | null }) {
  const base = new Map<string, ModelStats>(snap.models.baseline.map((b) => [b.model, b]));
  const drifting = new Set(snap.drift.map((d) => d.model));
  return (
    <>
      <p className={s.sub}>Drift: per model from every provider call (<code>model_calls</code>), per feature from every answer request&apos;s timeline (<code>system_flight</code>), last 24 h against the 7 days before. Drift needs {DRIFT.minCurrent}+ calls today and {DRIFT.minBaseline}+ in the baseline; otherwise nothing is claimed.</p>

      {snap.drift.length ? (
        <p className={s.alertWarn} role="status">{snap.drift.length} model{snap.drift.length === 1 ? "" : "s"} measurably worse: {snap.drift.map((d) => `${d.model} (${d.detail})`).join("; ")}</p>
      ) : null}
      {snap.capped ? <p className={s.sub}>A window reached the 20,000-row scan cap; figures cover the newest rows in it.</p> : null}

      <section aria-label="Features">
        <h2>Features</h2>
        {!snap.features.length ? <p className={s.empty}>No answer requests recorded in the last 24 hours.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Feature</th><th scope="col">Requests</th><th scope="col">Success</th><th scope="col">Baseline</th><th scope="col">First output p50</th><th scope="col">Duration p50 / p95</th><th scope="col">Failure causes</th><th scope="col">Provider cost</th></tr></thead>
              <tbody>
                {snap.features.map((f) => (
                  <tr key={f.feature}>
                    <td>{f.feature}{f.regression ? " · REGRESSION" : ""}</td>
                    <td>{f.requests}</td>
                    <td>{pct(f.successRate)}</td>
                    <td>{pct(f.baselineSuccessRate)}{delta(f.successRate, f.baselineSuccessRate)}</td>
                    <td>{ms(f.firstOutputP50Ms)}</td>
                    <td>{ms(f.p50Ms)} / {ms(f.p95Ms)}</td>
                    <td>{Object.entries(f.causes).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}</td>
                    <td>{usd(f.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Computation reuse">
        <h2>Computation reuse, 7 days</h2>
        <p className={s.sub}>Exact results kept in server memory per person for minutes (transcripts {REUSE.transcribe.ttlMs / 60_000} min, link reads {REUSE.link.ttlMs / 60_000} min); answers are never reused. Counts flushed from every instance once a minute.</p>
        {!reused ? <p className={s.empty}>Could not read the reuse counts.</p> : !reused.length ? <p className={s.empty}>Nothing reused or looked up yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">What</th><th scope="col">Hit rate</th><th scope="col">Hits</th><th scope="col">Shared in flight</th><th scope="col">Misses</th><th scope="col">Kept</th><th scope="col">Not eligible</th></tr></thead>
              <tbody>{reused.map((r) => <tr key={r.ns}><td>{r.ns}</td><td>{pct(r.hitRate)}</td><td>{r.hit}</td><td>{r.shared}</td><td>{r.miss}</td><td>{r.store}</td><td>{r.skip}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Models">
        <h2>Models</h2>
        {!snap.models.current.length ? <p className={s.empty}>No provider calls recorded in the last 24 hours.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Model</th><th scope="col">Calls</th><th scope="col">Success</th><th scope="col">Timeouts</th><th scope="col">Rate-limited</th><th scope="col">Quality-gate rejects</th><th scope="col">p50 / p95</th><th scope="col">Baseline p95</th><th scope="col">Cost per success</th></tr></thead>
              <tbody>
                {snap.models.current.map((m) => {
                  const b = base.get(m.model);
                  return (
                    <tr key={m.model}>
                      <td>{m.model}{drifting.has(m.model) ? " · DRIFT" : ""}</td>
                      <td>{m.calls}{b ? ` (baseline ${b.calls})` : ""}</td>
                      <td>{pct(m.successRate)}{delta(m.successRate, b?.successRate ?? null)}</td>
                      <td>{pct(m.timeoutRate)}</td>
                      <td>{pct(m.rateLimitedRate)}</td>
                      <td>{m.gateRejects}</td>
                      <td>{ms(m.p50Ms)} / {ms(m.p95Ms)}</td>
                      <td>{ms(b?.p95Ms ?? null)}</td>
                      <td>{usd(m.usdPerSuccess)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
