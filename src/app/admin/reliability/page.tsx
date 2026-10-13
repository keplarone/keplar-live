import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { DRIFT, observatorySnapshot, type ModelStats } from "@/lib/ops/observatory";
import { REUSE, reuseDays } from "@/lib/reuse/cache";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const ms = (n: number | null) => (n === null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`);
const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(n < 0.01 ? 5 : 3)}`);
const delta = (cur: number | null, base: number | null) => (cur === null || base === null ? "" : ` (${cur >= base ? "+" : ""}${((cur - base) * 100).toFixed(1)} pts)`);

/** Model drift and per-feature reliability (src/lib/ops/observatory.ts). Real rows only; too little data shows as "—", never a guess. */
export default async function AdminReliabilityPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [snap, reused] = await Promise.all([observatorySnapshot().catch(() => null), reuseDays(7).catch(() => null)]);
  if (!snap) {
    return <div className={s.page}><p className={s.empty}>Could not read model calls or flight records.</p></div>;
  }
  const base = new Map<string, ModelStats>(snap.models.baseline.map((b) => [b.model, b]));
  const drifting = new Set(snap.drift.map((d) => d.model));
  const v = snap.version;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · reliability · last 24 h vs the 7 days before · real rows only</p>
        <h1>Reliability</h1>
        <p className={s.sub}>
          Per model from every provider call (<code>model_calls</code>), per feature from every answer request&apos;s timeline (<code>system_flight</code>). Drift needs {DRIFT.minCurrent}+ calls today and {DRIFT.minBaseline}+ in the baseline; otherwise nothing is claimed.
          Alerts only: routing and people&apos;s chosen models are never changed from here. Deployment: {v.commit ?? "unknown"}{v.ref ? ` (${v.ref})` : ""}{v.env ? ` · ${v.env}` : ""}. <Link href="/admin">Operations</Link> · <Link href="/admin/flight">Flight recorder</Link>
        </p>
      </header>

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
    </div>
  );
}
