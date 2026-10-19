import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { Faq } from "@/components/sections/Faq";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { ClusterLinks } from "@/components/seo/ClusterLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { modelRows } from "@/lib/free-tools/explorer";
import { TOOLS_HUB, toolPath, type Tool } from "@/lib/free-tools/registry";
import { abs } from "@/lib/seo";
import { webPage } from "@/lib/seo-graph";
import { titleFor } from "@/lib/seo/titles";
import { brand } from "@/lib/site";
import prose from "@/components/sections/sections.module.css";
import hero from "@/components/page/RoutePlaceholder.module.css";
import { CitationTool } from "./CitationTool";
import { ModelsExplorer } from "./ModelsExplorer";
import { PlanTool } from "./PlanTool";
import { ToolForm } from "./ToolForm";

/** WebApplication structured data for a free tool: free of charge, in the browser, published by Keplar. No ratings: none are collected. */
export function toolApp(t: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": abs(`${toolPath(t)}#app`),
    name: t.name,
    url: abs(toolPath(t)),
    description: t.metaDescription,
    applicationCategory: t.cluster === "study" ? "EducationalApplication" : "UtilitiesApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": abs("/#organization") },
    isPartOf: { "@id": abs("/#website") },
  };
}

export function toolHowTo(t: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to use the ${t.name}`,
    description: t.lede,
    url: abs(toolPath(t)),
    inLanguage: "en",
    step: t.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, name: text.split(/(?<=[.!?:])\s/)[0].slice(0, 110), text, url: abs(`${toolPath(t)}#how-it-works`) })),
  };
}

function Ui({ tool }: { tool: Tool }) {
  if (tool.kind === "model") return <ToolForm tool={tool} />;
  if (tool.slug === "citation-formatter") return <CitationTool tool={tool} />;
  if (tool.slug === "learning-plan-generator") return <PlanTool tool={tool} />;
  if (tool.slug === "ai-model-comparison") return <ModelsExplorer rows={modelRows()} />;
  return null;
}

/** One free tool page: hero, the tool, how it works, what you get, FAQ, where it leads in the product, and the topic's links. */
export function ToolPage({ tool }: { tool: Tool }) {
  const path = toolPath(tool);
  return (
    <>
      <PageHero label={tool.kind === "local" ? "Free tool · runs in your browser" : "Free tool · no account"} title={tool.h1} lede={tool.lede} />
      <section className={prose.section} style={{ paddingTop: 0 }}>
        <div className={prose.inner}>
          <Breadcrumbs trail={[{ name: "Free tools", path: TOOLS_HUB }, { name: tool.name, path }]} />
          <Ui tool={tool} />
        </div>
      </section>
      <section className={prose.section} style={{ paddingTop: "var(--s-8)" }}>
        <div className={`${prose.inner} ${prose.prose}`}>
          <h2 id="how-it-works">How it works</h2>
          <ol>{tool.steps.map((st) => <li key={st}>{st}</li>)}</ol>
          <h2 id="what-you-get">What you get</h2>
          <ul>{tool.output.map((o) => <li key={o}>{o}</li>)}</ul>
          {tool.examples.length ? (
            <>
              <h2 id="examples">Examples</h2>
              <ul>{tool.examples.map((ex) => <li key={ex.title}><strong>{ex.title}.</strong> {Object.entries(ex.input).filter(([, v]) => v).map(([k, v]) => `${tool.fields.find((f) => f.id === k)?.label ?? k}: ${v.length > 140 ? `${v.slice(0, 140)}…` : v}`).join(" · ")}</li>)}</ul>
            </>
          ) : null}
          <h2 id="in-keplar">Where it leads in {brand.name}</h2>
          <p>{tool.product.why}</p>
          <div className={hero.ctaRow}><TrackedLink where={`tool:${tool.slug}`} href={tool.product.href} size="md" arrow>{tool.product.label}</TrackedLink></div>
          <h2 id="keep-reading">Keep reading</h2>
          <ul>{tool.related.map((r) => <li key={r}><Link href={r}>{titleFor(r)}</Link></li>)}</ul>
          <ClusterLinks path={path} />
        </div>
      </section>
      <Faq title="Questions" entries={tool.faq} />
      <JsonLd data={webPage({ path, title: tool.metaTitle, description: tool.metaDescription })} />
      <JsonLd data={toolApp(tool)} />
      <JsonLd data={toolHowTo(tool)} />
    </>
  );
}
