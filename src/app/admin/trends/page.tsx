import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { allRows, getSettings, recentLog } from "@/lib/trends/store";
import { RowActions, TrendsControls } from "@/components/admin/TrendsControls";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

/** Trend tracker: kill switch, limits, every candidate page with its gate results, and the review log. Admin only. */
export default async function AdminTrendsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [settings, rows, log] = await Promise.all([getSettings(), allRows(), recentLog(80)]);
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · SEO · trend tracker</p>
        <h1>Trend pages</h1>
        <p className={s.sub}>
          Once a day the tracker reads Google Trends (public feeds), keeps only AI-related queries that pass the safety filter, matches them to a term in the Keplar glossary, builds a short grounded page and runs the quality gates. Only pages that pass are eligible. Auto-publish is <b>{settings.autoPublish ? "ON" : "OFF"}</b>; the tracker is <b>{settings.paused ? "PAUSED (kill switch)" : "running"}</b>. Pages: {count("published")} published, {count("held")} waiting for approval, {count("rejected")} rejected, {count("rolled_back")} rolled back. Public index: <Link href="/topics">/topics</Link>.
        </p>
      </header>
      {settings.paused ? <p className={s.alertBad} role="alert">Paused. Nothing is built or published, and every /topics page returns 404.</p> : null}

      <section className={s.panel} aria-labelledby="ctl-h">
        <h2 id="ctl-h">Controls</h2>
        <TrendsControls settings={{ paused: settings.paused, autoPublish: settings.autoPublish, maxPerDay: settings.maxPerDay, maxLive: settings.maxLive }} />
      </section>

      <section className={s.panel} aria-labelledby="pages-h">
        <h2 id="pages-h">Pages and gate results</h2>
        {rows.length === 0 ? <p className={s.empty}>Nothing has been built yet. The first daily run will log here.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr>{["Term", "Status", "From query", "Source", "Words", "Gates", "Created", ""].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.status === "published" ? <Link href={`/topics/${r.id}`}>{r.page?.term ?? r.id}</Link> : r.page?.term ?? r.id}</td>
                    <td>{r.status}</td>
                    <td>{r.query}</td>
                    <td>{r.source}</td>
                    <td>{r.page?.words ?? "—"}</td>
                    <td>{r.gates ? (r.gates.pass ? "all passed" : r.gates.reasons.join("; ")) : r.reason ?? "—"}</td>
                    <td>{r.createdAt.slice(0, 16).replace("T", " ")} UTC</td>
                    <td><RowActions slug={r.id} status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel} aria-labelledby="log-h">
        <h2 id="log-h">Review log</h2>
        {log.length === 0 ? <p className={s.empty}>No entries yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr>{["When (UTC)", "Kind", "What happened"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{log.map((l) => <tr key={l.id}><td>{l.at.slice(0, 16).replace("T", " ")}</td><td>{l.kind}</td><td>{l.message}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
