import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqLd } from "@/lib/kb/jsonld";
import { vsBySlug, vsPages, VS_ACCESSED } from "@/lib/kb/vs";
import { abs, pageMeta } from "@/lib/seo";
import { softwareApp } from "@/lib/structuredData";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import s from "@/components/kb/kb.module.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return vsPages.map((v) => ({ slug: v.slug }));
}
type Props = { params: Promise<{ slug: string }> };
const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props) {
  const v = vsBySlug((await params).slug);
  if (!v) return {};
  return pageMeta(`/vs/${v.slug}`, v.title, v.description, { article: { published: VS_ACCESSED, modified: VS_ACCESSED } });
}

export default async function VsPage({ params }: Props) {
  const v = vsBySlug((await params).slug);
  if (!v) notFound();
  const path = `/vs/${v.slug}`;
  return (
    <div className={s.shell}>
      <div style={{ maxWidth: "var(--l-max)", margin: "0 auto" }}>
        <Breadcrumbs trail={[{ name: "Compare", path: "/vs" }, { name: `Keplar vs ${v.name}`, path }]} />
        <h1 className={s.h1}>{v.title.replace(": what each is for and how they differ", "")}</h1>
        <p className={s.lede}>{v.description}</p>
        <p className={s.meta}><span>Details about {v.name} read on <time dateTime={VS_ACCESSED}>{date(VS_ACCESSED)}</time></span></p>
        <div className={s.notice} role="note" style={{ marginBottom: "var(--s-8)" }}>
          Keplar wrote this page, so we are not neutral. {v.name} details come from {v.vendor}&apos;s own public pages, cited below. Plans and prices change. Check the source before you decide, and tell us if anything here is wrong.
        </div>
        <article className={s.prose}>
          {v.summary.map((t, i) => <p key={i}>{t}</p>)}
          <h2 id="public-facts">What {v.vendor} lists publicly</h2>
          <ul>{v.publicFacts.map((f) => <li key={f}>{f}</li>)}</ul>
          <p>Sources, read {date(VS_ACCESSED)}: {v.sources.map((x, i) => <span key={x.url}>{i ? "; " : ""}<a href={x.url} rel="noopener noreferrer nofollow" target="_blank">{x.label}</a></span>)}.</p>
          <h2 id="side-by-side">Side by side</h2>
          <div className={s.tableWrap} tabIndex={0} role="region" aria-label={`Keplar and ${v.name} compared`}>
            <table className={s.table}>
              <thead><tr><th scope="col">Feature</th><th scope="col">Keplar</th><th scope="col">{v.name}</th></tr></thead>
              <tbody>{v.rows.map((r) => <tr key={r.feature}><th scope="row">{r.feature}</th><td>{r.keplar}</td><td>{r.them}</td></tr>)}</tbody>
            </table>
          </div>
          {v.overlap ? <div className={s.callout} role="note"><b>Overlap</b>{v.overlap}</div> : null}
          <h2 id="choose-them">When {v.name} is the better choice</h2>
          <ul>{v.chooseThem.map((c) => <li key={c}>{c}</li>)}</ul>
          <h2 id="choose-keplar">When Keplar may fit better</h2>
          <ul>{v.chooseKeplar.map((c) => <li key={c}>{c}</li>)}</ul>
          <h2 id="not-claimed">What this page does not claim</h2>
          <p>It does not claim Keplar answers more accurately, more safely or more privately than {v.name}. Keplar&apos;s own limits: answers in the browser do not search the web (it reads a page only when you paste its link, and web search runs in the desktop app&apos;s Live Research, in beta), and it shows no confidence or accuracy score. Keplar is not AGI or superintelligence. See <Link href="/docs/get-started/what-keplar-cannot-do">what Keplar cannot do</Link>.</p>
        </article>
        <section className={s.faq} aria-labelledby="vs-faq">
          <h2 id="vs-faq">Questions</h2>
          {v.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </section>
        <div className={s.cta}>
          <p>The simplest comparison is your own question. Keplar is free to start, and each answer shows which models responded and where they differed.</p>
          <div className={s.ctaRow}><TrackedLink where={`vs:${v.slug}`} href="/app" size="md" arrow>Try Keplar free</TrackedLink></div>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", "@id": abs(`${path}#page`), name: v.title, description: v.description, url: abs(path), dateModified: VS_ACCESSED, inLanguage: "en", about: softwareApp() }} />
      <JsonLd data={faqLd(v.faq)} />
    </div>
  );
}
