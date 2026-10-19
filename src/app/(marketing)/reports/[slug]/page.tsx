import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/kb/Markdown";
import { Toc } from "@/components/kb/Toc";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { ClusterLinks } from "@/components/seo/ClusterLinks";
import { CREATOR_CREDIT } from "@/lib/identity";
import { faqLd, faqPairs, tocOf } from "@/lib/kb/jsonld";
import { allReports, reportBySlug } from "@/lib/kb/reports";
import { abs, pageMeta } from "@/lib/seo";
import { titleFor } from "@/lib/seo/titles";
import { brand, PRODUCTION_URL } from "@/lib/site";
import s from "@/components/kb/kb.module.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return allReports().map((r) => ({ slug: r.slug }));
}

type Props = { params: Promise<{ slug: string }> };
const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const REPO = "https://github.com/keplarone/keplar-live/blob/main/";

export async function generateMetadata({ params }: Props) {
  const r = reportBySlug((await params).slug);
  if (!r) return {};
  return pageMeta(r.path, r.metaTitle, r.description, { article: { published: r.published, modified: r.updated, authors: [brand.companyName] } });
}

/** One research report: the write-up, its data files, and the Report structured data. */
export default async function ReportPage({ params }: Props) {
  const r = reportBySlug((await params).slug);
  if (!r) notFound();
  const toc = tocOf(r.nodes).filter((t) => t.depth === 2);
  const faq = faqPairs(r.nodes);
  const org = { "@type": "Organization", "@id": abs("/#organization"), name: brand.companyName, url: PRODUCTION_URL };
  return (
    <div className={s.shell}>
      <div className={`${s.grid} ${s.grid2} ${s.gridPost}`}>
        <div>
          <Breadcrumbs trail={[{ name: "Reports", path: "/reports" }, { name: r.metaTitle, path: r.path }]} />
          <h1 className={s.h1}>{r.title}</h1>
          <p className={s.lede}>{r.description}</p>
          <p className={s.meta}>
            <span>{`By ${CREATOR_CREDIT}`}</span>
            <span>Published <time dateTime={r.published}>{date(r.published)}</time></span>
            {r.updated !== r.published ? <span>Updated <time dateTime={r.updated}>{date(r.updated)}</time></span> : null}
            <span>{Math.max(1, Math.round(r.words / 220))} min read</span>
          </p>
          <details className={s.tocInline}>
            <summary>On this page</summary>
            <ol>{toc.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
          </details>
          <article className={s.prose}>
            <Markdown nodes={r.nodes} />
            {r.dataFiles.length ? (
              <>
                <h2 id="data-files">Data files</h2>
                <ul>{r.dataFiles.map((f) => <li key={f}><a href={`${REPO}${f}`} rel="noopener noreferrer">{f}</a> in the Keplar repository</li>)}</ul>
              </>
            ) : null}
            {r.related.length ? (
              <>
                <h2 id="keep-reading">Keep reading</h2>
                <ul>{r.related.map((p) => <li key={p}><Link href={p}>{titleFor(p)}</Link></li>)}</ul>
              </>
            ) : null}
            <ClusterLinks path={r.path} />
          </article>
          <div className={s.cta}>
            <p>See how Keplar answers your own question: which models responded, how far they agreed and where they split.</p>
            <div className={s.ctaRow}><TrackedLink where={`report:${r.slug}`} href="/app" size="md" arrow>Try Keplar free</TrackedLink></div>
          </div>
        </div>
        <Toc items={toc} />
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Report", "@id": abs(`${r.path}#report`), headline: r.title, name: r.title, description: r.description, datePublished: r.published, dateModified: r.updated, mainEntityOfPage: abs(r.path), url: abs(r.path), author: org, publisher: org, inLanguage: "en", isAccessibleForFree: true, keywords: r.keywords.join(", "), wordCount: r.words, isPartOf: { "@type": "CollectionPage", name: "Keplar research reports", url: abs("/reports") }, ...(r.dataFiles.length ? { isBasedOn: r.dataFiles.map((f) => `${REPO}${f}`) } : {}) }} />
      {faq.length ? <JsonLd data={faqLd(faq)} /> : null}
    </div>
  );
}
