import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { allUseCases } from "@/lib/kb/usecases";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";

export const metadata = pageMeta("/use-cases", "What to use Keplar for: ten practical use cases", "Concrete ways to use Keplar: compare options before buying, check a claim, study for an exam, research a topic, review code, build a site and more, each with honest limits.");

export default function UseCasesPage() {
  const list = allUseCases();
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Use cases</p>
          <h1 className={s.h1}>What people use Keplar for</h1>
          <p className={s.lede}>Each page explains one job, how to ask, what Keplar does with the question, what you still have to check, and where it falls short.</p>
        </header>
        <div className={s.cards}>
          {list.map((u) => (
            <Link key={u.slug} href={u.path} className={s.card}>
              <h2>{u.title}</h2>
              <p>{u.description}</p>
            </Link>
          ))}
        </div>
        <p className={s.meta}>More: <Link href="/docs">docs</Link>, <Link href="/prompts">prompt library</Link>, <Link href="/blogs">blog</Link>, <Link href="/glossary">glossary</Link>.</p>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar use cases", url: abs("/use-cases"), hasPart: list.map((u) => ({ "@type": "WebPage", name: u.title, url: abs(u.path) })) }} />
      <JsonLd data={breadcrumbs([{ name: "Use cases", path: "/use-cases" }])} />
    </div>
  );
}
