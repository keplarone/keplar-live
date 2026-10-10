import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { CREATOR_CREDIT } from "@/lib/identity";
import { brand, PRODUCTION_URL } from "@/lib/site";
import { livePage } from "@/lib/trends/store";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { TrackedLink } from "@/components/growth/TrackedLink";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic"; // the kill switch and rollback must show a 404 at once

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const r = await livePage((await params).slug);
  if (!r?.page) return { robots: { index: false, follow: false } };
  const mod = (r.publishedAt ?? r.createdAt).slice(0, 10);
  return pageMeta(`/topics/${r.id}`, r.page.title, r.page.description, { image: `/topics/${r.id}/og`, article: { published: mod, modified: mod, authors: [brand.companyName] } });
}

export default async function Topic({ params }: Props) {
  const r = await livePage((await params).slug);
  if (!r?.page) notFound();
  const p = r.page;
  const path = `/topics/${r.id}`;
  const date = (r.publishedAt ?? r.createdAt).slice(0, 10);
  const org = { "@id": abs("/#organization") };
  // Topic pages are assembled, not written by a person: the Organization is the author and publisher. The two co-founders are
  // credited publisher-side through that Organization's founder array (site-wide graph) and the visible "Published by" line.
  const orgNode = { "@type": "Organization", ...org, name: brand.companyName, url: PRODUCTION_URL };
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <p className={s.crumbs}><Link href="/topics">Topics</Link><span aria-hidden>/</span>{p.term}</p>
        <h1 className={s.h1}><TwoTone text={p.title} /></h1>
        <p className={s.lede}>{p.intro}</p>
        <p className={s.meta}>
          <span>{`Published by ${CREATOR_CREDIT}`}</span>
          <span>Assembled <time dateTime={date}>{date}</time> from the Keplar glossary and library. Not written by a person on this topic; not a substitute for the primary source.</span>
        </p>
        <article className={s.prose}>
          <h2 id="what-it-means">What it means</h2>
          <p>{p.definition}</p>
          {p.inKeplar ? <p><strong>In Keplar:</strong> {p.inKeplar}</p> : null}

          <h2 id="in-our-library">Where Keplar covers it</h2>
          <ul>{p.library.map((l) => <li key={l.path}><Link href={l.path}>{l.title}</Link>: {l.description}</li>)}</ul>
          <p>The full list of terms is in the <Link href="/glossary">glossary</Link>.</p>

          <h2 id="how-to-check">How to check what you read about {p.term.toLowerCase()}</h2>
          <ol>{p.howToCheck.map((h) => <li key={h}>{h}</li>)}</ol>

          {p.alsoSearched.length ? (
            <>
              <h2 id="related-searches">Related searches</h2>
              <p>Queries Google Trends listed alongside this topic on {p.observed.date} (source: {p.observed.source}). Listed as reported; no volumes.</p>
              <ul>{p.alsoSearched.map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          ) : null}

          {p.news.length ? (
            <>
              <h2 id="in-the-news">In the news (as listed by Google Trends)</h2>
              <ul>{p.news.map((n) => <li key={n.url}><a href={n.url} rel="nofollow noopener noreferrer" target="_blank">{n.title}</a> ({n.source}). Keplar has not checked this article.</li>)}</ul>
            </>
          ) : null}

          <h2 id="why-this-page">Why this page exists</h2>
          <p>{p.observed.note}</p>

          <h2 id="faq">FAQ</h2>
          {p.faq.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
          <p>Spotted a mistake? Tell us through <Link href="/feedback?kind=problem&from=topic-page" rel="nofollow">feedback</Link> and we will fix or remove the page.</p>
        </article>
        <div className={s.cta}>
          <p>See where several AI models agree and where they differ on your own question. Free to try with no signup.</p>
          <div className={s.ctaRow}><TrackedLink where={`topic:${r.id}`} href="/app" size="md" arrow>Try Keplar free</TrackedLink></div>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", "@id": abs(`${path}#article`), headline: p.title, description: p.description, datePublished: date, dateModified: date, mainEntityOfPage: abs(path), url: abs(path), image: abs(`${path}/og`), author: orgNode, publisher: orgNode, inLanguage: "en", isPartOf: { "@type": "CollectionPage", name: "Keplar topics", url: abs("/topics") }, about: { "@type": "DefinedTerm", name: p.term, description: p.definition, inDefinedTermSet: abs("/glossary#set") } }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <JsonLd data={breadcrumbs([{ name: "Topics", path: "/topics" }, { name: p.term, path }])} />
    </div>
  );
}
