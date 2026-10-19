import Link from "next/link";
import { notFound } from "next/navigation";
import { Inline, Markdown } from "@/components/kb/Markdown";
import { Toc } from "@/components/kb/Toc";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { CREATOR_CREDIT, FOUNDERS } from "@/lib/identity";
import { allPosts, postBySlug } from "@/lib/kb/blog";
import { allDocs } from "@/lib/kb/docs";
import { blogPosting, faqLd, faqPairs, tocOf } from "@/lib/kb/jsonld";
import { pageMeta } from "@/lib/seo";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { ClusterLinks } from "@/components/seo/ClusterLinks";
import { productCta } from "@/lib/seo/clusters";
import s from "@/components/kb/kb.module.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };
const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props) {
  const p = postBySlug((await params).slug);
  if (!p) return {};
  return pageMeta(p.path, p.metaTitle, p.description, { article: { published: p.published, modified: p.updated, authors: FOUNDERS.map((f) => f.name) }, image: `/og/blogs/${p.slug}` });
}

export default async function BlogPost({ params }: Props) {
  const p = postBySlug((await params).slug);
  if (!p) notFound();
  const toc = tocOf(p.nodes).filter((t) => t.depth === 2);
  const faq = faqPairs(p.nodes);
  const more = p.related.map((path) => allPosts().find((x) => x.path === path) ?? allDocs().find((x) => x.path === path)).filter(Boolean) as { path: string; title: string; description: string }[];
  return (
    <div className={s.shell}>
      <div className={`${s.grid} ${s.grid2} ${s.gridPost}`}>
        <div>
          <Breadcrumbs trail={[{ name: "Blog", path: "/blogs" }, { name: p.title, path: p.path }]} />
          <h1 className={s.h1}>{p.title}</h1>
          <p className={s.lede}>{p.description}</p>
          <p className={s.meta}>
            <span>{`By ${CREATOR_CREDIT}`}</span>
            <span>Published <time dateTime={p.published}>{date(p.published)}</time></span>
            {p.updated !== p.published ? <span>Updated <time dateTime={p.updated}>{date(p.updated)}</time></span> : null}
            <span>{p.readingMinutes} min read</span>
          </p>
          <details className={s.tocInline}>
            <summary>On this page</summary>
            <ol>{toc.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
          </details>
          <article className={s.prose}>
            <Markdown nodes={p.nodes} />
          </article>
          {more.length ? (
            <div className={s.prose} style={{ marginTop: "var(--s-12)" }}>
              <h2 id="keep-reading">Keep reading</h2>
              <ul>{more.map((m) => <li key={m.path}><Link href={m.path}>{m.title}</Link>: <Inline text={m.description} /></li>)}</ul>
            </div>
          ) : null}
          <div className={s.prose} style={{ marginTop: "var(--s-12)" }}><ClusterLinks path={p.path} /></div>
          <div className={s.cta}>
            <p>See it on your own question. Keplar is free to try with no signup, and the answer shows which models responded and where they differed.</p>
            <div className={s.ctaRow}><TrackedLink where={`blog:${p.slug}`} href="/app" size="md" arrow>Try Keplar free</TrackedLink>{productCta(p.path) ? <TrackedLink where={`blog:${p.slug}:product`} href={productCta(p.path)!.href} size="md" variant="secondary">{productCta(p.path)!.label}</TrackedLink> : null}</div>
          </div>
        </div>
        <Toc items={toc} />
      </div>
      <JsonLd data={blogPosting({ path: p.path, title: p.title, description: p.description, published: p.published, updated: p.updated, category: p.category, keywords: p.keywords, words: p.words })} />
      {faq.length ? <JsonLd data={faqLd(faq)} /> : null}
    </div>
  );
}
