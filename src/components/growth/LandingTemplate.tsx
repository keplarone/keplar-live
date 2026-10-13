import Link from "next/link";
import { Faq } from "@/components/sections/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { landingBySlug, type LandingPage } from "@/lib/content/landing";
import { breadcrumbs, webPage } from "@/lib/seo-graph";
import { HeroField } from "@/components/motion/HeroField";
import { StickyCta } from "./StickyCta";
import { TrackedLink } from "./TrackedLink";
import { TryBox } from "./TryBox";
import hero from "@/components/page/RoutePlaceholder.module.css";
import prose from "@/components/sections/sections.module.css";
import { TwoTone } from "@/components/page/TwoTone";

/** Shared layout for the indexable landing and use-case pages. One h1, a primary CTA above the fold, a no-signup try box, FAQ, related links. */
export function LandingTemplate({ page }: { page: LandingPage }) {
  const related = page.related.map((p) => ({ path: p, title: landingBySlug(p.slice(1))?.label ?? RELATED_LABELS[p] ?? p }));
  return (
    <>
      <HeroField variant="how" />
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label}>{page.label}</p>
          <h1 className={hero.title}><TwoTone text={page.h1} /></h1>
          <p className={hero.lede}>{page.lede}</p>
          <div className={hero.ctaRow}>
            <TrackedLink where={`${page.slug}:hero`} href="/app" size="lg" arrow>Try Keplar free</TrackedLink>
            <TrackedLink where={`${page.slug}:hero-pricing`} href="/pricing" size="lg" variant="secondary">See plans</TrackedLink>
          </div>
        </div>
      </header>
      <TryBox examples={page.examples} where={page.slug} />
      <section className={prose.section} style={{ paddingTop: "var(--s-16)", paddingBottom: "var(--s-16)" }}>
        <div className={`${prose.inner} ${prose.prose}`}>
          {page.sections.map((s) => (
            <div key={s.h2} style={{ display: "contents" }} data-reveal>
              <h2>{s.h2}</h2>
              {s.p?.map((t) => <p key={t}>{t}</p>)}
              {s.bullets ? <ul style={{ listStyle: "disc", paddingLeft: "1.25em" }}>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul> : null}
            </div>
          ))}
          <h2>Keep reading</h2>
          <ul className={prose.linkList} style={{ listStyle: "disc", paddingLeft: "1.25em" }}>
            {related.map((r) => (
              <li key={r.path}><Link href={r.path}>{r.title}</Link></li>
            ))}
          </ul>
        </div>
      </section>
      <Faq title="Questions" entries={page.faq} />
      <section className={prose.section} style={{ paddingTop: 0, textAlign: "center" }}>
        <div className={prose.inner}>
          <div className={hero.ctaRow} style={{ justifyContent: "center", marginTop: 0 }}>
            <TrackedLink where={`${page.slug}:footer`} href="/app" size="lg" arrow>Try Keplar free</TrackedLink>
            <TrackedLink where={`${page.slug}:footer-signup`} href="/signup" size="lg" variant="secondary">Create a free account</TrackedLink>
          </div>
        </div>
      </section>
      <StickyCta where={page.slug} />
      <JsonLd data={webPage({ path: page.path, title: page.metaTitle, description: page.metaDescription })} />
      <JsonLd data={breadcrumbs([{ name: page.label, path: page.path }])} />
    </>
  );
}

const RELATED_LABELS: Record<string, string> = {
  "/how-it-works": "How Keplar works",
  "/pricing": "Plans and pricing",
  "/compare": "Keplar compared with other tools",
  "/for-you": "Keplar for you",
  "/for-developers": "Keplar for developers",
  "/guides/study-from-a-pdf": "How to study from a PDF with AI",
  "/guides/slide-deck-from-notes": "How to turn rough notes into a slide deck",
  "/blogs/how-to-check-an-ai-answer": "How to check an AI answer",
  "/guides/why-ai-models-disagree": "Why AI models disagree",
  "/download": "Download the desktop app",
  "/docs/studio/roblox-studio-mode": "Docs: Roblox Studio mode",
  "/docs/studio/roblox-cloud": "Docs: Roblox Cloud overnight jobs",
  "/docs/studio/effects-and-textures": "Docs: effects, flipbooks and textures",
  "/docs/studio/blender-mode": "Docs: Blender mode",
  "/docs/studio/blender-cloud-rendering": "Docs: Blender Cloud rendering",
};
