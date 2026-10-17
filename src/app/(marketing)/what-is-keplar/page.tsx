import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { BUSINESS_FACTS, CAPABILITY_MATRIX, FACT_SECTIONS, factStatus, MATRIX_COLUMNS, NOT_JUST_MULTI_MODEL, WHAT_IS_KEPLAR } from "@/lib/content/product-facts";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs, webPage } from "@/lib/seo-graph";
import { brand } from "@/lib/site";
import { tiers } from "@/lib/tiers";
import s from "@/components/sections/sections.module.css";
import kb from "@/components/kb/kb.module.css";

const PATH = "/what-is-keplar";
const TITLE = `What is ${brand.companyName}? Everything Keplar does`;
const DESCRIPTION = "Keplar is an AI workspace: a multi-model answer engine plus Study mode, Deep Research, slides, image and video generation, website and app building, an API, and Keplar Business for companies.";

export const metadata = pageMeta(PATH, TITLE, DESCRIPTION);

const CELL = { yes: "Yes", beta: "Beta", no: "No", "n/a": "Not applicable" } as const;
const STATUS = { live: null, beta: "Beta", soon: "Coming soon" } as const;
const paid = tiers.filter((t) => t.price && t.price > 0).map((t) => `${t.name} $${t.price}`).join(", ");

/** Shown on the page and as FAQPage JSON-LD (the Faq component renders both from the same list). */
const QA = [
  { q: `What is ${brand.companyName}?`, a: WHAT_IS_KEPLAR },
  { q: "Is Keplar just a tool that asks several AI models?", a: NOT_JUST_MULTI_MODEL },
  { q: "What can Keplar make?", a: "Websites and web apps it builds, tests and publishes (with custom domains), mobile app projects (beta), images, short videos (beta, Pro), slide decks you can export to PowerPoint or PDF, study sets with flashcards and quizzes, and research reports." },
  { q: "Is there a free plan?", a: `Yes. Free is $0 and runs on free open models with up to 50 questions a day (fair use), image and video questions, Study mode, saved chats and optional memory. Paid plans: ${paid} a month, adding premium models, more usage, Deep Research, slides, image and video generation, and Create.` },
  { q: "What is Keplar Business?", a: `${BUSINESS_FACTS.intro} Plans: ${BUSINESS_FACTS.plans.map((p) => `${p.name} (${p.price})`).join(", ")}.` },
  { q: "Is Keplar AGI or superintelligence?", a: "No. Keplar is a practical multi-model workspace. Agreement between models does not prove an answer is correct, which is why Keplar shows the disagreements and the reasoning, and why health, legal and money answers are general information, not professional advice." },
];

function ItemList() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Everything in ${brand.name}`,
    itemListElement: FACT_SECTIONS.flatMap((sec) => sec.facts).map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.name, description: f.what, ...(f.href && !f.href.includes("#") ? { url: abs(f.href) } : {}) })),
  };
}

export default function WhatIsKeplarPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "What is Keplar?", path: PATH }])} />
      <JsonLd data={webPage({ path: PATH, title: TITLE, description: DESCRIPTION })} />
      <JsonLd data={ItemList()} />
      <PageHero
        label="What is Keplar?"
        title="Much more than one answer from many models."
        lede="An answer engine that asks several AI models and shows where they disagree, inside a workspace that also studies, researches, presents, creates and publishes."
        ctas={[{ href: "/app", label: `Try ${brand.name} free` }, { href: "/features", label: "Every feature and its status", variant: "secondary" }]}
      />
      <section className={s.section} style={{ paddingTop: "var(--s-12)" }}>
        <div className={`${s.inner} ${s.prose}`}>
          <p>{WHAT_IS_KEPLAR}</p>
          <p>{NOT_JUST_MULTI_MODEL}</p>
          <p className={kb.relatedLine}>
            On this page: {FACT_SECTIONS.map((sec, i) => (
              <span key={sec.id}>{i ? " · " : ""}<a href={`#${sec.id}`}>{sec.title}</a></span>
            ))} · <a href="#business">Keplar Business</a> · <a href="#where">Where each feature runs</a>
          </p>
          {FACT_SECTIONS.map((sec) => (
            <div key={sec.id} id={sec.id}>
              <h2>{sec.title}</h2>
              <p>{sec.intro}</p>
              <ul>
                {sec.facts.map((f) => {
                  const st = STATUS[factStatus(f)];
                  return (
                    <li key={f.name}>
                      <strong>{f.href ? <Link href={f.href}>{f.name}</Link> : f.name}</strong>
                      {st ? <> ({st})</> : null}: {f.what}
                      {f.plans ? <> <em>Plans: {f.plans}.</em></> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div id="business">
            <h2>{BUSINESS_FACTS.title}</h2>
            <p>{BUSINESS_FACTS.intro}</p>
            <p>Every Business plan includes: {BUSINESS_FACTS.includes.join(", ")}.</p>
            <ul>
              {BUSINESS_FACTS.plans.map((p) => (
                <li key={p.name}><strong>{p.name}</strong>, {p.price}, for {p.audience.toLowerCase()}: {p.highlights.join(", ")}.</li>
              ))}
            </ul>
            <p><a href="https://business.keplar.one">Visit business.keplar.one</a></p>
          </div>
          <div id="where">
            <h2>Where each feature runs</h2>
            <p>Keplar One (keplar.one) and Keplar Business (business.keplar.one) are separate products on the same account. This table shows which surface has what; the same data is published as <a href="/capabilities.json">capabilities.json</a>.</p>
            <div className={kb.tableWrap} tabIndex={0} role="region" aria-label="Feature availability by product and platform">
              <table className={kb.table}>
                <thead><tr><th scope="col">Feature</th>{MATRIX_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>
                  {CAPABILITY_MATRIX.map((r) => (
                    <tr key={r.feature}>
                      <th scope="row">{r.feature}{r.note ? <><br /><small>{r.note}</small></> : null}</th>
                      {r.cells.map((c, i) => <td key={MATRIX_COLUMNS[i]}>{CELL[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p>
            Next: see <Link href="/how-it-works">how the answer engine works</Link>, every feature with its status on{" "}
            <Link href="/features">Everything in Keplar</Link>, what is coming on the <Link href="/roadmap">roadmap</Link>, and{" "}
            <Link href="/pricing">pricing</Link>.
          </p>
        </div>
      </section>
      <Faq title="Questions about Keplar" entries={QA} />
      <FinalCta />
    </>
  );
}
