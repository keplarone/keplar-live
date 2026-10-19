import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsFrame } from "@/components/kb/DocsFrame";
import { Inline, Markdown } from "@/components/kb/Markdown";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { allDocs, docBySlug, docSections, docsIn, neighbors, sectionById } from "@/lib/kb/docs";
import { faqLd, faqPairs, howToLd, techArticle, tocOf } from "@/lib/kb/jsonld";
import { pageMeta } from "@/lib/seo";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { ClusterLinks } from "@/components/seo/ClusterLinks";
import { productCta } from "@/lib/seo/clusters";
import s from "@/components/kb/kb.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...docSections.map((x) => ({ slug: [x.id] })), ...allDocs().map((d) => ({ slug: d.slug.split("/") }))];
}

type Props = { params: Promise<{ slug: string[] }> };
const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props) {
  const slug = (await params).slug;
  const d = docBySlug(slug.join("/"));
  if (d) return pageMeta(d.path, `${d.title} | Keplar docs`, d.description, { absoluteTitle: true, article: { published: d.updated, modified: d.updated }, image: `/og/docs/${d.slug}` });
  const sec = slug.length === 1 ? sectionById(slug[0]) : undefined;
  if (sec) return pageMeta(`/docs/${sec.id}`, `${sec.title} | Keplar docs`, sec.blurb.slice(0, 158), { absoluteTitle: true, image: `/og/docs/${sec.id}` });
  return {};
}

export default async function DocPage({ params }: Props) {
  const slug = (await params).slug;
  const d = docBySlug(slug.join("/"));
  const sec = slug.length === 1 ? sectionById(slug[0]) : undefined;

  if (sec && !d) {
    const pages = docsIn(sec.id);
    return (
      <DocsFrame current={`/docs/${sec.id}`}>
        <Breadcrumbs trail={[{ name: "Docs", path: "/docs" }, { name: sec.title, path: `/docs/${sec.id}` }]} />
        <h1 className={s.h1}>{sec.title}</h1>
        <p className={s.lede}>{sec.blurb}</p>
        <ul className={s.list} style={{ marginTop: "var(--s-8)" }}>
          {pages.map((p) => (
            <li key={p.path}><Link href={p.path}><strong>{p.title}</strong><span>{p.description}</span></Link></li>
          ))}
        </ul>
        <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: `${sec.title} | Keplar docs`, url: `https://keplar.one/docs/${sec.id}`, isPartOf: { "@id": "https://keplar.one/#website" }, inLanguage: "en" }} />
      </DocsFrame>
    );
  }
  if (!d) notFound();

  const section = sectionById(d.section)!;
  const { prev, next } = neighbors(d);
  const toc = tocOf(d.nodes);
  const faq = faqPairs(d.nodes);
  const how = d.howto ? howToLd({ path: d.path, title: d.title, description: d.description, nodes: d.nodes }) : null;
  const related = d.related.map((p) => ({ p, d: allDocs().find((x) => x.path === p) })).filter((x) => x.d);

  return (
    <DocsFrame current={d.path} toc={toc}>
      <Breadcrumbs trail={[{ name: "Docs", path: "/docs" }, { name: section.title, path: `/docs/${section.id}` }, { name: d.title, path: d.path }]} />
      <h1 className={s.h1}>{d.title}</h1>
      <p className={s.lede}>{d.description}</p>
      <p className={s.meta}><span>Updated <time dateTime={d.updated}>{longDate(d.updated)}</time></span><span>{Math.max(1, Math.round(d.words / 220))} min read</span></p>
      <details className={s.tocInline}>
        <summary>On this page</summary>
        <ol>{toc.filter((t) => t.depth === 2).map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
      </details>
      <article className={s.prose}>
        <Markdown nodes={d.nodes} />
        {related.length ? (
          <>
            <h2 id="related">Related</h2>
            <ul>{related.map((r) => <li key={r.p}><Link href={r.p}>{r.d!.title}</Link>: <Inline text={r.d!.description} /></li>)}</ul>
          </>
        ) : null}
        <ClusterLinks path={d.path} />
      </article>
      <nav className={s.pnRow} aria-label="Previous and next page">
        {prev ? <Link href={prev.path} className={s.pn} data-dir="prev"><small>Previous</small><span>{prev.title}</span></Link> : <span />}
        {next ? <Link href={next.path} className={s.pn} data-dir="next"><small>Next</small><span>{next.title}</span></Link> : null}
      </nav>
      <div className={s.cta}>
        <p>Questions this page does not answer? Write to <a href="mailto:team@keplar.one">team@keplar.one</a>, or try Keplar on your own question.</p>
        <div className={s.ctaRow}>{productCta(d.path).href !== "/app" ? <TrackedLink where={`docs:${d.slug}:product`} href={productCta(d.path).href} size="md" arrow>{productCta(d.path).label}</TrackedLink> : null}<TrackedLink where={`docs:${d.slug}`} href="/app" size="md" arrow={productCta(d.path).href === "/app"} variant={productCta(d.path).href === "/app" ? "primary" : "secondary"}>Try Keplar free</TrackedLink></div>
      </div>
      <JsonLd data={techArticle({ path: d.path, title: d.title, description: d.description, published: d.updated, updated: d.updated, section: section.title, keywords: d.keywords, words: d.words, image: `/og/docs/${d.slug}` })} />
      {faq.length ? <JsonLd data={faqLd(faq)} /> : null}
      {how ? <JsonLd data={how} /> : null}
    </DocsFrame>
  );
}
