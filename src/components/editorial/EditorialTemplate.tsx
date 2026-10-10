import Link from "next/link";
import type { ReactNode } from "react";
import { Faq } from "@/components/sections/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { HeroField } from "@/components/motion/HeroField";
import { StickyCta } from "@/components/growth/StickyCta";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { TryBox } from "@/components/growth/TryBox";
import { editorialBySlug, type EditorialPage, type Table } from "@/lib/content/editorial";
import { ACCESSED, sources, type Source } from "@/lib/content/sources";
import { guideBySlug } from "@/lib/content/guides";
import { landingBySlug } from "@/lib/content/landing";
import { abs } from "@/lib/seo";
import { article, breadcrumbs, webPage } from "@/lib/seo-graph";
import { brand } from "@/lib/site";
import hero from "@/components/page/RoutePlaceholder.module.css";
import s from "./editorial.module.css";

const TOKEN = /\{\{(\w+)\}\}|\[([^\]]+)\]\((\/[^)\s]*)\)/g;

/** Source ids in order of first use (answer, sections, tables, Keplar block): this is the citation numbering. */
function citationOrder(page: EditorialPage): string[] {
  const seen: string[] = [];
  const scan = (t?: string) => {
    if (!t) return;
    for (const m of t.matchAll(TOKEN)) if (m[1] && !seen.includes(m[1])) seen.push(m[1]);
  };
  const scanTable = (tb?: Table) => tb && [...tb.head, ...tb.rows.flat()].forEach(scan);
  scan(page.answer);
  for (const b of page.sections) {
    b.p?.forEach(scan);
    b.bullets?.forEach(scan);
    scanTable(b.table);
    b.after?.forEach(scan);
  }
  page.keplar.p.forEach(scan);
  return seen;
}

function Inline({ text, order }: { text: string; order: string[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const n = order.indexOf(m[1]) + 1;
      const src = sources[m[1]];
      if (n > 0 && src) {
        out.push(
          <span key={i++} className={s.cite}>
            <a href={`#src-${src.id}`} aria-label={`Source ${n}: ${src.title}`}>[{n}]</a>
          </span>,
        );
      }
    } else {
      out.push(<Link key={i++} href={m[3]}>{m[2]}</Link>);
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function DataTable({ t, order }: { t: Table; order: string[] }) {
  return (
    <div className={s.tableBlock}>
      <div className={s.tableScroll} role="region" aria-label={t.caption} tabIndex={0}>
        <table className={s.table}>
          <caption>{t.caption}</caption>
          <thead>
            <tr>{t.head.map((h, i) => <th key={i} scope="col"><Inline text={h} order={order} /></th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (ci === 0 ? <th key={ci} scope="row"><Inline text={c} order={order} /></th> : <td key={ci}><Inline text={c} order={order} /></td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const labelOf = (path: string) =>
  editorialBySlug(path.slice(1))?.label ?? landingBySlug(path.slice(1))?.label ?? guideBySlug(path.replace("/guides/", ""))?.title ?? RELATED[path] ?? path;
const RELATED: Record<string, string> = { "/how-it-works": "How Keplar works", "/models": "Which AI models Keplar uses", "/compare-ai-models": "Compare AI models" };

/** Reading layout for the superintelligence cluster and other sourced explainers. Everything is server-rendered text. */
export function EditorialTemplate({ page }: { page: EditorialPage }) {
  const order = citationOrder(page);
  const cited = order.map((id) => sources[id]).filter(Boolean) as Source[];
  const jsonld = article({ path: page.path, title: page.h1, description: page.metaDescription, published: page.published, updated: page.updated });
  const isArticle = Boolean(editorialBySlug(page.slug));
  const withCitations = { ...jsonld, citation: cited.map((c) => ({ "@type": "CreativeWork", name: c.title, url: c.url })), about: page.term ? { "@id": abs(`${page.path}#term`) } : undefined };
  return (
    <>
      <HeroField variant="how" />
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label}>{page.label}</p>
          <h1 className={hero.title}>{page.h1}</h1>
        </div>
      </header>
      <div className={s.wrap}>
        <div className={s.inner}>
          <aside className={s.answer} aria-label="Short answer">
            <span className={s.answerLabel}>Short answer</span>
            <Inline text={page.answer} order={order} />
          </aside>
          <div className={s.meta}>
            <p>
              By the {brand.name} Team · Published <time dateTime={page.published}>{longDate(page.published)}</time> · Updated <time dateTime={page.updated}>{longDate(page.updated)}</time> · {page.readingMinutes} min read
            </p>
            {page.freshness ? <p>{page.freshness}</p> : null}
          </div>
          <div className={hero.ctaRow} style={{ marginTop: 0 }}>
            <TrackedLink where={`${page.slug}:hero`} href="/app" size="lg" arrow>Try Keplar free</TrackedLink>
            <TrackedLink where={`${page.slug}:hero-how`} href="/how-it-works" size="lg" variant="secondary">How Keplar works</TrackedLink>
          </div>
          <nav className={s.toc} aria-label="On this page">
            <h2>On this page</h2>
            <ol>
              {page.sections.map((b) => <li key={b.id}><a href={`#${b.id}`}>{b.h2}</a></li>)}
              <li><a href="#keplar">{page.keplar.h2}</a></li>
              {cited.length ? <li><a href="#sources">Sources</a></li> : null}
            </ol>
          </nav>
          <article className={s.col} aria-label={page.h1}>
            {page.sections.map((b) => (
              <section key={b.id} id={b.id} style={{ display: "contents" }}>
                <h2 id={`${b.id}-h`}>{b.h2}</h2>
                {b.p?.map((t, i) => <p key={i}><Inline text={t} order={order} /></p>)}
                {b.bullets ? <ul>{b.bullets.map((t, i) => <li key={i}><Inline text={t} order={order} /></li>)}</ul> : null}
                {b.table ? <DataTable t={b.table} order={order} /> : null}
                {b.after?.map((t, i) => <p key={i}><Inline text={t} order={order} /></p>)}
              </section>
            ))}
          </article>
          <section id="keplar" className={s.keplar} aria-labelledby="keplar-h">
            <h2 id="keplar-h">{page.keplar.h2}</h2>
            {page.keplar.p.map((t, i) => <p key={i}><Inline text={t} order={order} /></p>)}
          </section>
          <TryBox examples={page.examples} where={page.slug} heading="Ask it yourself. No signup." />
          {cited.length ? (
          <section id="sources" className={s.sources} aria-labelledby="sources-h">
            <h2 id="sources-h">Sources</h2>
            <p style={{ marginBottom: "var(--s-3)" }}>All links were opened on <time dateTime={ACCESSED}>{longDate(ACCESSED)}</time> unless a note says otherwise.</p>
            <ol>
              {cited.map((c) => (
                <li key={c.id} id={`src-${c.id}`}>
                  {c.by}. <a href={c.url} rel="noopener">{c.title}</a>. {c.date}. <small>{c.kind === "primary" ? "Primary source" : "Secondary source"} · accessed {longDate(ACCESSED)}{c.note ? ` · ${c.note}` : ""}</small>
                </li>
              ))}
            </ol>
          </section>
          ) : null}
          <nav className={s.related} aria-label="Related pages">
            <h2>Keep reading</h2>
            <ul>{page.related.map((p) => <li key={p}><Link href={p}>{labelOf(p)}</Link></li>)}</ul>
          </nav>
        </div>
      </div>
      <Faq title="Questions" entries={page.faq} />
      <StickyCta where={page.slug} />
      <JsonLd data={webPage({ path: page.path, title: page.metaTitle, description: page.metaDescription })} />
      {isArticle ? <JsonLd data={withCitations} /> : null /* /about and /models are not articles, so no Article markup */}
      <JsonLd data={breadcrumbs([{ name: page.label, path: page.path }])} />
      {page.term ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "DefinedTerm",
            "@id": abs(`${page.path}#term`),
            name: page.term.name,
            alternateName: page.term.alternateName,
            description: page.term.description,
            url: abs(page.path),
            inDefinedTermSet: { "@type": "DefinedTermSet", name: `${brand.name} glossary`, url: abs("/superintelligence") },
          }}
        />
      ) : null}
    </>
  );
}
