import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { TOOLS, TOOLS_HUB, toolPath } from "@/lib/free-tools/registry";
import { pageMeta, abs } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { CLUSTERS } from "@/lib/seo/clusters";
import { brand } from "@/lib/site";
import prose from "@/components/sections/sections.module.css";
import s from "@/components/tools/tools.module.css";

export const metadata = pageMeta(
  TOOLS_HUB,
  "Free AI tools: prompts, study guides, summaries",
  `Ten free tools from ${brand.name}: a prompt optimizer, study guide and flashcard generators, a summarizer, a writing improver, a citation formatter, a study planner and more. No account.`,
);

/** The free tools hub: every tool, grouped by the topic it belongs to. */
export default function ToolsHub() {
  const groups = CLUSTERS.map((c) => ({ c, tools: TOOLS.filter((t) => t.cluster === c.id) })).filter((g) => g.tools.length);
  return (
    <>
      <PageHero label="Free tools" title="Small tools, no account, honest about what they do." lede={`Each tool does one job. The AI-backed ones run on ${brand.name}'s free lane with free open models; the others run entirely in your browser. Every result says what to check.`} ctas={[{ href: "/", label: "Ask Keplar instead" }]} />
      <section className={prose.section} style={{ paddingTop: 0 }}>
        <div className={prose.inner}>
          {groups.map(({ c, tools }) => (
            <div key={c.id} style={{ marginBottom: "var(--s-12)" }}>
              <h2 className={prose.headline} style={{ fontSize: "var(--t-title)" }}><Link href={c.hub}>{c.name}</Link></h2>
              <ul className={s.cards}>
                {tools.map((t) => (
                  <li key={t.slug} className={s.card}>
                    <h3><Link href={toolPath(t)}>{t.name}</Link></h3>
                    <p>{t.metaDescription}</p>
                    <p><span className={s.kind} style={{ marginLeft: 0 }}>{t.kind === "local" ? "In your browser" : "Free AI"}</span></p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <JsonLd data={breadcrumbs([{ name: "Free tools", path: TOOLS_HUB }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": abs(`${TOOLS_HUB}#page`), name: "Free AI tools", url: abs(TOOLS_HUB), isPartOf: { "@id": abs("/#website") }, inLanguage: "en", mainEntity: { "@type": "ItemList", itemListElement: TOOLS.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: abs(toolPath(t)) })) } }} />
    </>
  );
}
