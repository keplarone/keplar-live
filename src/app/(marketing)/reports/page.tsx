import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { allReports } from "@/lib/kb/reports";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { brand } from "@/lib/site";
import prose from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/reports",
  "Research reports: reproducible evaluations from Keplar",
  `Dated, reproducible evaluations run by the ${brand.name} team, each with its method, results, limitations and the raw data files in the repository. No invented figures.`,
);

const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The reports hub: every published report, newest first. */
export default function ReportsIndex() {
  const reports = allReports();
  return (
    <>
      <PageHero label="Research reports" title="Runs we can show our working for." lede="Each report states its method, its results as recorded, its limitations, how to reproduce it, and where the raw data lives. A new run is a new page; a published report is not rewritten." ctas={[{ href: "/app", label: "Try Keplar free" }]} where="reports:index" />
      <section className={prose.section} style={{ paddingTop: "var(--s-8)" }}>
        <div className={prose.inner}>
          <ul style={{ display: "grid", gap: "var(--s-8)", maxWidth: "64ch" }}>
            {reports.map((r) => (
              <li key={r.slug}>
                <h2 style={{ fontSize: "var(--t-title)", lineHeight: "var(--lh-title)", fontWeight: "var(--w-medium)" }}><Link href={r.path}>{r.title}</Link></h2>
                <p style={{ color: "var(--c-ink-2)", marginTop: "var(--s-2)" }}>{r.description}</p>
                <p style={{ color: "var(--c-ink-3)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>{r.kind === "evaluation" ? "Evaluation" : "Report"} · published {date(r.published)}{r.updated !== r.published ? `, updated ${date(r.updated)}` : ""} · {Math.max(1, Math.round(r.words / 220))} min read</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <JsonLd data={breadcrumbs([{ name: "Reports", path: "/reports" }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": abs("/reports#page"), name: "Keplar research reports", url: abs("/reports"), isPartOf: { "@id": abs("/#website") }, inLanguage: "en", mainEntity: { "@type": "ItemList", itemListElement: reports.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.title, url: abs(r.path) })) } }} />
    </>
  );
}
