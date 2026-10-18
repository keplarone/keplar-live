import Link from "next/link";
import { notFound } from "next/navigation";
import { Faq } from "@/components/sections/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { ToolForm } from "@/components/seo/ToolForm";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { TwoTone } from "@/components/page/TwoTone";
import { clusterById } from "@/lib/seo/clusters";
import { pageMeta } from "@/lib/seo";
import { GENERATED_META } from "@/lib/seo/generated-meta";
import { breadcrumbs } from "@/lib/seo-graph";
import { TOOLS, toolBySlug } from "@/lib/seo/tools";
import hero from "@/components/page/RoutePlaceholder.module.css";
import prose from "@/components/sections/sections.module.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolBySlug((await params).slug);
  if (!tool) return {};
  const path = `/tools/${tool.slug}`;
  const sheet = GENERATED_META[path];
  return pageMeta(path, sheet?.title ?? tool.title, sheet?.description ?? tool.description);
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolBySlug((await params).slug);
  if (!tool) notFound();
  const cluster = clusterById(tool.clusterId);
  const items = tool.kind === "browse" ? cluster.pages.map((p) => ({ path: p.path, label: p.label, intent: p.intent })) : [];
  const others = TOOLS.filter((t) => t.slug !== tool.slug).slice(0, 4);
  return (
    <>
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label}>{tool.label}</p>
          <h1 className={hero.title}><TwoTone text={tool.h1} /></h1>
          <p className={hero.lede}>{tool.lede}</p>
          <div className={hero.ctaRow}>
            <TrackedLink where={`tool:${tool.slug}`} href={tool.productPath} size="lg" arrow>{tool.productLabel}</TrackedLink>
          </div>
        </div>
      </header>
      <section className={prose.section}>
        <div className={`${prose.inner} ${prose.prose}`}>
          <p role="note">{tool.notice}</p>
          <ToolForm slug={tool.slug} kind={tool.kind} items={items} />
          {tool.sections.map((s) => (
            <div key={s.h2}>
              <h2>{s.h2}</h2>
              {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
            </div>
          ))}
          <h2>{tool.example.title}</h2>
          <p>{tool.example.text}</p>
          <h2>Keep going</h2>
          <ul>
            <li><Link href={cluster.hub}>{cluster.name}</Link></li>
            <li><Link href={tool.productPath}>{tool.productLabel}</Link></li>
            {others.map((t) => <li key={t.slug}><Link href={`/tools/${t.slug}`}>{t.title}</Link></li>)}
          </ul>
        </div>
      </section>
      <Faq title="Questions" entries={tool.faq} />
      <JsonLd data={breadcrumbs([{ name: "Tools", path: "/tools" }, { name: tool.title, path: `/tools/${tool.slug}` }])} />
    </>
  );
}
