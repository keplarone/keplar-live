import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { flightByRequest, flightsLastDay, recentFlights, summarizeFlights, type FlightRow } from "@/lib/ops/flight";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const when = (iso: string) => iso.replace("T", " ").slice(0, 19) + " UTC";
const ms = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

/** Execution timelines per request (src/lib/ops/flight.ts). Real rows only, text-free, kept 7 days. */
export default async function AdminFlightPage({ searchParams }: { searchParams: Promise<{ req?: string; view?: string }> }) {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const sp = await searchParams;
  const [one, recent, day] = await Promise.all([
    sp.req ? flightByRequest(sp.req).catch(() => null) : Promise.resolve(null),
    recentFlights({ outcome: sp.view === "all" ? undefined : "failed", limit: 50 }).catch(() => null),
    flightsLastDay().catch(() => null),
  ]);
  const sum = day ? summarizeFlights(day) : null;
  const all = sp.view === "all";
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · flight recorder · real rows only</p>
        <h1>Execution timelines</h1>
        <p className={s.sub}>
          One text-free timeline per answer request: stages, every provider request (model, provider, outcome, latency, cost), tools, cancellation and the outcome with its cause.
          Find a request by the <code>x-request-id</code> its response carried. Kept 7 days. <Link href="/admin">Operations</Link> · <Link href="/admin/errors">Errors</Link> · <Link href="/admin/reliability">Reliability</Link>
        </p>
        <form method="get" className={s.sub}>
          <label>Request id <input name="req" defaultValue={sp.req ?? ""} size={40} /></label> <button type="submit">Open timeline</button>
        </form>
      </header>

      {sum ? (
        <section className={s.grid} aria-label="Last 24 hours">
          <div className={s.stat}><span>Requests, 24 h</span><b>{sum.requests}</b><small>{sum.outcomes.answered} answered · {sum.outcomes.cancelled} cancelled by the person</small></div>
          <div className={s.stat}><span>Success rate</span><b>{pct(sum.successRate)}</b><small>answered ÷ (all − cancelled)</small></div>
          <div className={s.stat}><span>Time to first output</span><b>{ms(sum.firstOutputMs.p50)}</b><small>p50 · p95 {ms(sum.firstOutputMs.p95)}</small></div>
          <div className={s.stat}><span>Total duration</span><b>{ms(sum.durationMs.p50)}</b><small>p50 · p95 {ms(sum.durationMs.p95)}</small></div>
          <div className={s.stat}><span>Failure causes</span><b>{Object.values(sum.causes).reduce((a, b) => a + b, 0)}</b><small>{Object.entries(sum.causes).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}</small></div>
        </section>
      ) : <p className={s.empty}>Could not read the flight log.</p>}

      {sp.req ? (one ? <Timeline row={one} /> : <p className={s.empty}>No timeline for that request id (older than 7 days, never reached the engine, or not an answer request).</p>) : null}

      <section aria-label="Recent requests">
        <h2>{all ? "Recent requests" : "Recent failures"} <small><Link href={all ? "/admin/flight" : "/admin/flight?view=all"}>{all ? "failures only" : "show all"}</Link></small></h2>
        {!recent ? <p className={s.empty}>Could not read the flight log.</p> : !recent.length ? <p className={s.empty}>Nothing recorded yet{all ? "" : " that failed"}.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">When</th><th scope="col">Outcome</th><th scope="col">Cause</th><th scope="col">Feature</th><th scope="col">Plan</th><th scope="col">Calls (failed)</th><th scope="col">First output</th><th scope="col">Duration</th><th scope="col">Request id</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}><td>{when(r.at)}</td><td>{r.outcome}{r.errorCode ? ` (${r.errorCode})` : ""}</td><td>{r.cause ?? "—"}</td><td>{r.feature}</td><td>{r.plan}</td><td>{r.calls.returned} ({r.calls.failed})</td><td>{ms(r.firstOutputMs)}</td><td>{ms(r.durationMs)}</td><td><Link href={`/admin/flight?req=${encodeURIComponent(r.reqId)}`}>{r.reqId}</Link></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Timeline({ row }: { row: FlightRow }) {
  return (
    <section aria-label="Timeline">
      <h2>{row.reqId}: {row.outcome}{row.cause ? ` · cause ${row.cause}` : ""}</h2>
      <p className={s.sub}>
        {when(row.at)} · {row.feature} · {row.plan} · {row.calls.sent} sent, {row.calls.returned} returned, {row.calls.failed} failed, {row.calls.rateLimited} rate-limited · ${row.calls.usd.toFixed(4)} ·
        first output {ms(row.firstOutputMs)} · total {ms(row.durationMs)}{row.droppedEvents ? ` · ${row.droppedEvents} events over the cap not kept` : ""}
      </p>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead><tr><th scope="col">+ms</th><th scope="col">Event</th><th scope="col">Detail</th><th scope="col">Outcome</th><th scope="col">Latency</th><th scope="col">Cost</th></tr></thead>
          <tbody>
            {row.events.map((e, i) => (
              <tr key={i}>
                <td>{e.t}</td>
                <td>{e.k}</td>
                <td>{[e.stage, e.status, e.slot, e.model, e.provider, e.code].filter(Boolean).join(" · ")}</td>
                <td>{e.ok === undefined ? "" : e.ok ? "ok" : `failed${e.reason ? ` (${e.reason})` : ""}`}</td>
                <td>{e.ms === undefined ? "" : ms(e.ms)}</td>
                <td>{e.usd === undefined ? "" : `$${e.usd.toFixed(5)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
