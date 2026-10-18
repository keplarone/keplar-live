import Link from "next/link";
import { DocsFrame } from "@/components/kb/DocsFrame";
import { JsonLd } from "@/components/seo/JsonLd";
import { allDocs, docSections, docsIn } from "@/lib/kb/docs";
import { pageMeta, abs } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { softwareApp } from "@/lib/structuredData";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta("/docs", "Keplar Docs: Guides, Concepts and Reference", "How to use Keplar and how routing, disagreement detection, verification and synthesis work, plus Create, Studio, connectors, plans, limits and privacy.");

const START = ["/docs/get-started/quickstart", "/docs/how-it-works/which-questions-use-more-models", "/docs/how-it-works/disagreement-detection", "/docs/billing-plans/credits-explained", "/docs/privacy-security/data-handling"];

export default function DocsHome() {
  const docs = allDocs();
  const start = START.map((p) => docs.find((d) => d.path === p)).filter(Boolean) as typeof docs;
  return (
    <DocsFrame current="/docs">
      <p className={s.crumbs}>Docs</p>
      <h1 className={s.h1}><TwoTone text={"Keplar docs"} /></h1>
      <p className={s.lede}>How to use Keplar, how it reaches an answer, and what it will and will not do. Written to be checked against the product: where a number can change, the page says where to see the current one.</p>
      <p className={s.meta}><span>{docs.length} pages</span><span>{docSections.length} sections</span></p>
      <div className={s.prose}>
        <h2 id="start">Start here</h2>
      </div>
      <ul className={s.list} style={{ marginTop: "var(--s-4)" }}>
        {start.map((d) => (
          <li key={d.path}><Link href={d.path}><strong>{d.title}</strong><span>{d.description}</span></Link></li>
        ))}
      </ul>
      <div className={s.prose} style={{ marginTop: "var(--s-12)" }}>
        <h2 id="sections">Everything, by section</h2>
      </div>
      <div className={s.cards} style={{ marginTop: "var(--s-5)" }}>
        {docSections.map((sec) => (
          <Link key={sec.id} href={`/docs/${sec.id}`} className={s.card}>
            <small>{docsIn(sec.id).length} pages</small>
            <h3>{sec.title}</h3>
            <p>{sec.blurb}</p>
          </Link>
        ))}
      </div>
      <p className={s.meta} style={{ marginTop: "var(--s-10)" }}>
        Looking for a term? See the <Link href="/glossary">glossary</Link>. Want example questions? Browse the <Link href="/prompts">prompt library</Link>. Longer reads are on the <Link href="/blogs">blog</Link>.
      </p>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar docs", url: abs("/docs"), isPartOf: { "@id": abs("/#website") }, about: { "@id": abs("/#app") }, inLanguage: "en" }} />
      <JsonLd data={breadcrumbs([{ name: "Docs", path: "/docs" }])} />
      <JsonLd data={softwareApp()} />
    </DocsFrame>
  );
}
