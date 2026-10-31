import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { funnel, seoRows, seoSnapshot, type FunnelRow } from "@/lib/seo/events";
import { sitemapPaths } from "@/app/sitemap";
import { lastmodFor } from "@/lib/content/lastmod";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const STALE_DAYS = 90;

/** Search-to-activation view: which public page a visit started on, and how far visits from it got. Admin only, real counts only. */
export default async function AdminSeoPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const { at: nowMs, report } = await seoSnapshot(28);
  const rows = await seoRows(28, nowMs).catch(() => null);
  const f = rows ? funnel(rows) : null;
  const pages = sitemapPaths.map((p) => {
    const lm = lastmodFor(p);
    const age = lm ? Math.floor((nowMs - Date.parse(lm)) / 864e5) : null;
    return { path: p, lastmod: lm ?? "—", age };
  });
  const stale = pages.filter((p) => p.age !== null && p.age > STALE_DAYS);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const step = (r: FunnelRow) => (r.previous === null ? "—" : pct(r.browsers, r.previous));
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · SEO · last 28 days</p>
        <h1>Search to activation</h1>
        <p className={s.sub}>
          Counts come from visitors who allowed Analytics (and send no Global Privacy Control or Do Not Track signal), so they are a floor, not a total. Impressions, clicks, queries and rankings live in Google Search Console and Bing Webmaster Tools; Keplar cannot see them.
        </p>
      </header>

      <section className={s.panel} aria-labelledby="steps-h">
        <h2 id="steps-h">Funnel, step by step (distinct browsers)</h2>
        {!f ? (
          <p className={s.empty}>The store could not be read.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  {["Step", "All", "Of previous step", "Mobile", "Desktop", "Device not recorded"].map((h) => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.steps.map((r, i) => (
                  <tr key={r.event}>
                    <td>{r.label}</td>
                    <td>{r.browsers}</td>
                    <td>{step(r)}</td>
                    <td>{f.byDevice.mobile[i].browsers} ({step(f.byDevice.mobile[i])})</td>
                    <td>{f.byDevice.desktop[i].browsers} ({step(f.byDevice.desktop[i])})</td>
                    <td>{f.byDevice.unknown[i].browsers}</td>
                  </tr>
                ))}
                {f.revenue.map((r) => (
                  <tr key={r.event}>
                    <td>{r.label}</td>
                    <td>{r.browsers}</td>
                    <td>{step(r)}</td>
                    <td colSpan={3}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>Each rate is out of the browsers that reached the step above it (pricing → plan → checkout is its own chain). A browser can skip steps, so a rate can pass 100%. Device is the viewport class, recorded since this table was added; older events show as not recorded. Billing truth (paid subscriptions, MRR) is on /admin/growth from Whop.</p>
      </section>

      <section className={s.panel} aria-labelledby="funnel-h">
        <h2 id="funnel-h">First page of the visit → sign-up → first answer</h2>
        {!report ? (
          <p className={s.empty}>The store could not be read.</p>
        ) : report.length === 0 ? (
          <p className={s.empty}>No events recorded yet. They appear after visitors allow Analytics.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  {["Landing page", "Visits", "From search", "From AI assistants", "CTA clicks", "Sign-ups", "First question", "Answer shown", "Visit → sign-up"].map((h) => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.landing}>
                    <td>{r.landing}</td>
                    <td>{r.views}</td>
                    <td>{r.bySource.search ?? 0}</td>
                    <td>{r.bySource.ai ?? 0}</td>
                    <td>{r.ctaClicks}</td>
                    <td>{r.signups}</td>
                    <td>{r.firstPrompts}</td>
                    <td>{r.syntheses}</td>
                    <td>{pct(r.signups, r.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>“(unknown)” means the visitor allowed Analytics after landing, or cleared storage, so the first page was not recorded. Small numbers are noise: do not compare pages until each has a few hundred visits.</p>
      </section>

      <section className={s.panel} aria-labelledby="fresh-h">
        <h2 id="fresh-h">Freshness ({STALE_DAYS}-day review rule)</h2>
        {stale.length === 0 ? (
          <p className={s.empty}>No indexed page has gone {STALE_DAYS} days without a content review.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr><th scope="col">Page</th><th scope="col">Last content change</th><th scope="col">Days</th></tr>
              </thead>
              <tbody>
                {stale.map((p) => (
                  <tr key={p.path}><td>{p.path}</td><td>{p.lastmod}</td><td>{p.age}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>{pages.length} pages are in the sitemap. Review /si-vs-ai against the US executive order’s legislative-definition step (due about late November 2026) and /superintelligence whenever a cited lab statement changes. See docs/seo/WEEKLY-REVIEW.md.</p>
      </section>
    </div>
  );
}
