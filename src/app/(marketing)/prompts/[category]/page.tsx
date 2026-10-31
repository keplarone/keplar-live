import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptCard } from "@/components/kb/PromptCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { promptCategories, promptCategoryBySlug } from "@/lib/kb/prompts";
import { abs, pageMeta } from "@/lib/seo";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import s from "@/components/kb/kb.module.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return promptCategories.map((c) => ({ category: c.slug }));
}
type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props) {
  const c = promptCategoryBySlug((await params).category);
  if (!c) return {};
  return pageMeta(`/prompts/${c.slug}`, `${c.name} prompts: ${c.prompts.length} copyable templates`, `${c.blurb} ${c.prompts.length} prompt templates with why each works and what to check afterward.`, { image: `/og/prompts/${c.slug}` });
}

export default async function PromptCategoryPage({ params }: Props) {
  const c = promptCategoryBySlug((await params).category);
  if (!c) notFound();
  const path = `/prompts/${c.slug}`;
  return (
    <div className={s.shell} data-o="kb shell">
      <div style={{ maxWidth: "var(--l-max)", margin: "0 auto" }}>
        <Breadcrumbs trail={[{ name: "Prompt library", path: "/prompts" }, { name: c.name, path }]} />
        <h1 className={s.h1} data-o="kb h1">{c.name} prompts</h1>
        <p className={s.lede}>{c.blurb}</p>
        <div className={s.prose}>
          {c.intro.map((p, i) => <p key={i}>{p}</p>)}
          <h2 id="tips">Habits for this category</h2>
          <ul>{c.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          <h2 id="prompts">The prompts</h2>
        </div>
        <div>{c.prompts.map((p) => <PromptCard key={p.id} p={p} />)}</div>
        <div className={s.prose} style={{ marginTop: "var(--s-10)" }}>
          <h2 id="related">Related</h2>
          <ul>
            {c.related.map((r) => <li key={r.href}><Link href={r.href}>{r.label}</Link></li>)}
            {promptCategories.filter((x) => x.slug !== c.slug).slice(0, 3).map((x) => <li key={x.slug}><Link href={`/prompts/${x.slug}`}>{x.name} prompts</Link></li>)}
          </ul>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: `${c.name} prompts`, url: abs(path), description: c.blurb, hasPart: c.prompts.map((p) => ({ "@type": "CreativeWork", name: p.title, text: p.text, url: abs(`${path}#${p.id}`) })) }} />
    </div>
  );
}
