import Link from "next/link";
import { notFound } from "next/navigation";
import { StickyCta } from "@/components/growth/StickyCta";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { guideBySlug, guides } from "@/lib/content/guides";
import { landingBySlug } from "@/lib/content/landing";
import { allPosts } from "@/lib/kb/blog";
import { pageMeta } from "@/lib/seo";
import { article, breadcrumbs } from "@/lib/seo-graph";
import hero from "@/components/page/RoutePlaceholder.module.css";
import prose from "@/components/sections/sections.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const m = pageMeta(g.path, g.title, g.metaDescription, { image: `/og/guides/${g.slug}` });
  return { ...m, openGraph: { ...m.openGraph, type: "article" as const, publishedTime: g.published, modifiedTime: g.updated } };
}

const titleOf = (path: string) =>
  landingBySlug(path.slice(1))?.label ?? guides.find((g) => g.path === path)?.title ?? allPosts().find((b) => b.path === path)?.title ?? path;

export default async function GuidePage({ params }: Props) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  return (
    <>
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label} data-o="RoutePlaceholder label"><Link href="/guides">Guides</Link></p>
          <h1 className={hero.title} data-o="RoutePlaceholder title"><TwoTone text={g.title} /></h1>
          <p className={hero.lede}>{g.summary}</p>
          <p style={{ marginTop: "var(--s-4)", color: "var(--c-ink-3)", fontSize: "var(--t-small)" }}>
            {g.readingMinutes} min read · Updated <time dateTime={g.updated}>{new Date(g.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
          </p>
        </div>
      </header>
      <article className={prose.section} style={{ paddingTop: "var(--s-8)" }}>
        <div className={`${prose.inner} ${prose.prose}`}>
          {g.sections.map((s) => (
            <div key={s.h2} style={{ display: "contents" }}>
              <h2>{s.h2}</h2>
              {s.p.map((t) => <p key={t}>{t}</p>)}
              {s.bullets ? <ul style={{ listStyle: "disc", paddingLeft: "1.25em" }}>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul> : null}
            </div>
          ))}
          <h2>Related</h2>
          <ul className={prose.linkList} style={{ listStyle: "disc", paddingLeft: "1.25em" }}>
            {g.related.map((p) => <li key={p}><Link href={p}>{titleOf(p)}</Link></li>)}
          </ul>
          <div className={hero.ctaRow}>
            <TrackedLink where={`guide:${g.slug}`} href="/app" size="lg" arrow>Try Keplar free</TrackedLink>
          </div>
        </div>
      </article>
      <StickyCta where={`guide:${g.slug}`} />
      <JsonLd data={article({ path: g.path, title: g.title, description: g.metaDescription, published: g.published, updated: g.updated })} />
      <JsonLd data={breadcrumbs([{ name: "Guides", path: "/guides" }, { name: g.title, path: g.path }])} />
    </>
  );
}
