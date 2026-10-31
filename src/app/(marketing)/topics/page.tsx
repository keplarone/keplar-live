import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { publishedRows } from "@/lib/trends/store";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const rows = await publishedRows().catch(() => []);
  // Nothing published yet is a thin index, so topics-sitemap.xml lists /topics only once something is published (Keplar pages carry no noindex).
  return pageMeta("/topics", "AI topics explained: what the terms mean and how to check claims", "Short, dated orientation pages for AI terms people are searching for, built from the Keplar glossary and library. Each says what it is and how to check what you read.");
}

export default async function Topics() {
  const rows = await publishedRows().catch(() => []);
  return (
    <div className={s.shell} data-o="kb shell">
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Topics</p>
          <h1 className={s.h1} data-o="kb h1"><TwoTone text={"AI topics explained"} /></h1>
          <p className={s.lede}>Short orientation pages for AI terms people are searching for. Each one is assembled from Keplar&apos;s reviewed glossary and library, dated, and says how to check what you read. For the full set of definitions see the <Link href="/glossary">glossary</Link>.</p>
        </header>
        {rows.length ? (
          <ul className={s.prose}>{rows.map((r) => <li key={r.id}><Link href={`/topics/${r.id}`}>{r.page!.term}</Link>: {r.page!.description}</li>)}</ul>
        ) : (
          <p className={s.lede}>No topic pages are published yet. Start with the <Link href="/glossary">glossary</Link> or the <Link href="/docs">docs</Link>.</p>
        )}
      </div>
      <JsonLd data={breadcrumbs([{ name: "Topics", path: "/topics" }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar topics", url: abs("/topics"), inLanguage: "en" }} />
    </div>
  );
}
