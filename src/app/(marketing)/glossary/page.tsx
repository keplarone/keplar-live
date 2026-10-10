import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { Inline } from "@/components/kb/Markdown";
import { glossary, slugOfTerm } from "@/lib/kb/glossary";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";

export const metadata = pageMeta("/glossary", "AI glossary: plain-English definitions of AI terms", "Plain-English definitions of AI terms from agent and context window to RAG and sycophancy, with notes on how each applies to Keplar.");

const letter = (t: string) => t.replace(/^[^A-Za-z]+/, "").charAt(0).toUpperCase();

function Link2({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith("#") ? <a href={href}>{children}</a> : <Link href={href}>{children}</Link>;
}

export default function GlossaryPage() {
  const terms = [...glossary].sort((a, b) => a.term.localeCompare(b.term));
  const letters = [...new Set(terms.map((t) => letter(t.term)))];
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Glossary</p>
          <h1 className={s.h1}>AI glossary</h1>
          <p className={s.lede}>{terms.length} terms in plain English. Where a term is part of how Keplar works, a note says exactly how, and links point to the longer explanation.</p>
          <nav aria-label="Jump to letter" className={s.pills} style={{ marginTop: "var(--s-5)" }}>
            {letters.map((l) => <a key={l} href={`#letter-${l}`} className={s.pill}>{l}</a>)}
          </nav>
        </header>
        <div className={s.termList}>
          {letters.map((l) => (
            <div key={l} id={`letter-${l}`}>
              <h2 className={s.letterH}>{l}</h2>
              {terms.filter((t) => letter(t.term) === l).map((t) => (
                <dl key={t.term} className={s.term} id={slugOfTerm(t.term)}>
                  <dt>{t.term}</dt>
                  <dd><Inline text={t.def} /></dd>
                  {t.inKeplar ? <dd className={s.termKeplar}><strong>In Keplar:</strong> {t.inKeplar}</dd> : null}
                  {t.see?.length ? <dd>See: {t.see.map((x, i) => <span key={x.href}>{i ? ", " : ""}<Link2 href={x.href}>{x.label}</Link2></span>)}</dd> : null}
                </dl>
              ))}
            </div>
          ))}
        </div>
        <p className={s.meta}>Definitions are general descriptions, not legal or technical specifications. Spot an error? Tell us through <Link href="/feedback">feedback</Link>.</p>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "DefinedTermSet", "@id": abs("/glossary#set"), name: "Keplar AI glossary", url: abs("/glossary"), inLanguage: "en", hasDefinedTerm: terms.map((t) => ({ "@type": "DefinedTerm", name: t.term, description: t.def, url: abs(`/glossary#${slugOfTerm(t.term)}`), inDefinedTermSet: abs("/glossary#set") })) }} />
      <JsonLd data={breadcrumbs([{ name: "Glossary", path: "/glossary" }])} />
    </div>
  );
}
