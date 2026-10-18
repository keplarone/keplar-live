import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { BuildLikeThis } from "@/components/create/showcase/BuildLikeThis";
import s from "@/components/create/showcase/Showcase.module.css";
import { SHOWCASE, SHOWCASE_DISCLOSURE, showcaseBySlug } from "@/lib/create/showcase/data";
import { pageMeta } from "@/lib/seo";
import { GENERATED_META } from "@/lib/seo/generated-meta";
import { breadcrumbs } from "@/lib/seo-graph";

export const dynamicParams = false;
export function generateStaticParams() {
  return SHOWCASE.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const it = showcaseBySlug((await params).slug);
  if (!it) return {};
  const path = `/showcase/${it.slug}`;
  const sheet = GENERATED_META[path];
  return pageMeta(path, sheet?.title ?? `${it.title}: ${it.style.toLowerCase()} ${it.kind.toLowerCase()} demo`, sheet?.description ?? `${it.line} A Keplar Create showcase demo made by the Keplar team, with the brief you would type to build something like it. Not a customer site.`);
}

export default async function ShowcaseDetail({ params }: { params: Promise<{ slug: string }> }) {
  const it = showcaseBySlug((await params).slug);
  if (!it) notFound();
  const i = SHOWCASE.indexOf(it);
  const prev = SHOWCASE[(i - 1 + SHOWCASE.length) % SHOWCASE.length];
  const next = SHOWCASE[(i + 1) % SHOWCASE.length];
  const src = `/sites/showcase/${it.slug}`;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <p className={s.kicker}><Link href="/showcase">Showcase</Link> / {it.kind} · {it.style} · {it.industry}</p>
          <h1 className={s.title}>{it.title}</h1>
        </div>
        <div>
          <p className={s.lead}>{it.line}</p>
          <p className={s.disclosure}>{SHOWCASE_DISCLOSURE}</p>
        </div>
      </header>
      <div className={s.detail}>
        <figure className={s.frameWrap} style={{ margin: 0 }}>
          <figcaption className={s.frameBar}><span>Demo preview · {it.complexity.toLowerCase()} build</span><a href={src} target="_blank" rel="noopener">Open full page</a></figcaption>
          <iframe className={s.frame} src={src} title={`${it.title} showcase demo preview`} loading="lazy" sandbox="" referrerPolicy="no-referrer" />
        </figure>
        <aside className={s.aside}>
          <section>
            <h2>The brief</h2>
            <p className={s.prompt}>{it.prompt}</p>
          </section>
          <section>
            <h2>Why it does not look generated</h2>
            <ol className={s.craft}>{it.craft.map((c) => <li key={c}>{c}</li>)}</ol>
          </section>
          <section>
            <h2>Palette</h2>
            <div className={s.swatches}>{[it.palette.bg, it.palette.surface, it.palette.ink, it.palette.muted, it.palette.accent].map((c) => <span key={c} style={{ background: c }} title={c} />)}</div>
          </section>
          <div className={s.actions}>
            <BuildLikeThis prompt={it.prompt} slug={it.slug} />
            <Link className={s.link} href="/showcase">All demos</Link>
          </div>
        </aside>
      </div>
      <nav className={s.pager} aria-label="More demos">
        <Link href={`/showcase/${prev.slug}`}><span>Previous</span>{prev.title}</Link>
        <Link href={`/showcase/${next.slug}`} style={{ textAlign: "right" }}><span>Next</span>{next.title}</Link>
      </nav>
      <JsonLd data={breadcrumbs([{ name: "Showcase", path: "/showcase" }, { name: it.title, path: `/showcase/${it.slug}` }])} />
    </div>
  );
}
