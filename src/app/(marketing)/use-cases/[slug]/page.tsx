import Link from "next/link";
import { notFound } from "next/navigation";
import { Inline, Markdown } from "@/components/kb/Markdown";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { allBlogAndDocsByPath } from "@/lib/kb/lookup";
import { webArticle } from "@/lib/kb/jsonld";
import { allUseCases, getUseCase } from "@/lib/kb/usecases";
import { pageMeta } from "@/lib/seo";
import s from "@/components/kb/kb.module.css";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamicParams = false;
export function generateStaticParams() {
  return allUseCases().map((u) => ({ slug: u.slug }));
}
type Props = { params: Promise<{ slug: string }> };
const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props) {
  const u = getUseCase((await params).slug);
  if (!u) return {};
  return pageMeta(u.path, u.title, u.description, { article: { published: u.updated, modified: u.updated }, image: `/og/use-cases/${u.slug}` });
}

export default async function UseCasePage({ params }: Props) {
  const u = getUseCase((await params).slug);
  if (!u) notFound();
  const more = u.related.map((p) => allBlogAndDocsByPath(p)).filter(Boolean) as { path: string; title: string; description: string }[];
  return (
    <div className={s.shell} data-o="kb shell">
      <div style={{ maxWidth: "var(--l-max)", margin: "0 auto" }}>
        <Breadcrumbs trail={[{ name: "Use cases", path: "/use-cases" }, { name: u.title, path: u.path }]} />
        <h1 className={s.h1} data-o="kb h1"><TwoTone text={u.title} /></h1>
        <p className={s.lede}>{u.description}</p>
        <p className={s.meta}><span>Updated <time dateTime={u.updated}>{date(u.updated)}</time></span></p>
        <article className={s.prose}><Markdown nodes={u.nodes} /></article>
        {more.length ? (
          <div className={s.prose} style={{ marginTop: "var(--s-12)" }}>
            <h2 id="keep-reading">Keep reading</h2>
            <ul>{more.map((m) => <li key={m.path}><Link href={m.path}>{m.title}</Link>: <Inline text={m.description} /></li>)}</ul>
          </div>
        ) : null}
        <div className={s.cta}>
          <p>Try it on your own question. Keplar is free to start, and each answer shows which models responded and where they differed.</p>
          <div className={s.ctaRow}><TrackedLink where={`use-case:${u.slug}`} href="/app" size="md" arrow>Try Keplar free</TrackedLink></div>
        </div>
      </div>
      <JsonLd data={webArticle({ path: u.path, title: u.title, description: u.description, updated: u.updated, keywords: u.keywords, words: u.words })} />
    </div>
  );
}
