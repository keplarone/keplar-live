import Link from "next/link";
import { Faq } from "@/components/sections/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { BuildBox } from "@/components/growth/BuildBox";
import { StickyCta } from "@/components/growth/StickyCta";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { createLanding as page } from "@/lib/growth/create-landing";
import { pageMeta } from "@/lib/seo";
import { breadcrumbs, webPage } from "@/lib/seo-graph";
import hero from "@/components/page/RoutePlaceholder.module.css";
import prose from "@/components/sections/sections.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta(page.path, page.metaTitle, page.metaDescription);

const RELATED: Record<string, string> = {
  "/showcase": "See what people built with Create",
  "/pricing": "Plans and pricing",
  "/for-founders": "Keplar for founders",
  "/for-small-business": "Keplar for small businesses",
};

export default function AiAppBuilderPage() {
  return (
    <>
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label}>{page.label}</p>
          <h1 className={hero.title}><TwoTone text={page.h1} /></h1>
          <p className={hero.lede}>{page.lede}</p>
          <div className={hero.ctaRow}>
            <TrackedLink where={`${page.slug}:hero`} href="/app/create" size="lg" arrow>Start building free</TrackedLink>
            <TrackedLink where={`${page.slug}:hero-showcase`} href="/showcase" size="lg" variant="secondary">See what people built</TrackedLink>
          </div>
        </div>
      </header>
      <BuildBox examples={page.examples} where={page.slug} />
      <section className={prose.section} style={{ paddingTop: "var(--s-16)", paddingBottom: "var(--s-16)" }}>
        <div className={`${prose.inner} ${prose.prose}`}>
          {page.sections.map((s) => (
            <div key={s.h2} style={{ display: "contents" }}>
              <h2>{s.h2}</h2>
              {"p" in s && s.p ? s.p.map((t) => <p key={t}>{t}</p>) : null}
              {"bullets" in s && s.bullets ? <ul style={{ listStyle: "disc", paddingLeft: "1.25em" }}>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul> : null}
            </div>
          ))}
          <h2>Keep reading</h2>
          <ul className={prose.linkList} style={{ listStyle: "disc", paddingLeft: "1.25em" }}>
            {page.related.map((p) => (
              <li key={p}><Link href={p}>{RELATED[p] ?? p}</Link></li>
            ))}
          </ul>
        </div>
      </section>
      <Faq title="Questions" entries={[...page.faq]} />
      <section className={prose.section} style={{ paddingTop: 0, textAlign: "center" }}>
        <div className={prose.inner}>
          <div className={hero.ctaRow} style={{ justifyContent: "center", marginTop: 0 }}>
            <TrackedLink where={`${page.slug}:footer`} href="/app/create" size="lg" arrow>Start building free</TrackedLink>
            <TrackedLink where={`${page.slug}:footer-pricing`} href="/pricing" size="lg" variant="secondary">See plans</TrackedLink>
          </div>
        </div>
      </section>
      <StickyCta where={page.slug} />
      <JsonLd data={webPage({ path: page.path, title: page.metaTitle, description: page.metaDescription })} />
      <JsonLd data={breadcrumbs([{ name: page.label, path: page.path }])} />
    </>
  );
}
