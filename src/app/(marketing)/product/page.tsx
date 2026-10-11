import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { Creation } from "@/components/sections/Creation";
import { FinalCta } from "@/components/sections/FinalCta";
import { LearnLinks } from "@/components/sections/LearnLinks";
import { howItWorks } from "@/lib/sections";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import { businessUrl } from "@/lib/business-site";
import s from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/product",
  "Multi-model AI answers, with the work shown",
  "Keplar asks multiple AI models your question, finds where they agree, investigates where they don't, and gives you one answer with consensus and disagreements shown.",
);

export default function ProductPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Product", path: "/product" }])} />
      <PageHero
        label="Product"
        title="One question. Multiple intelligences. One answer."
        lede={`${brand.name} asks multiple AI models your question, finds where they agree, investigates where they don't, and gives you one synthesized answer with the agreement and disagreements shown.`}
        ctas={[{ href: "/app", label: `Ask ${brand.name}` }, { href: "/how-it-works", label: "How it works", variant: "secondary" }]}
      />
      <ProductShowcase />
      <section className={s.section}>
        <div className={`${s.inner} ${s.prose}`}>
          <h2>How {brand.name} works</h2>
          <ol className={s.steps}>
            {howItWorks.map((st) => (
              <li key={st.name}>
                <span className={s.stepName}>{st.name}</span>
                <span>{st.text}</span>
              </li>
            ))}
          </ol>
          <h2>One answer, with its work shown</h2>
          <p>
            You don&apos;t get six answers to reconcile. You get one {brand.answer}, and a consensus figure that tells you how much the
            intelligences agreed after their evidence was weighed. It is a measure of agreement, not a guarantee: consensus can be
            wrong, and {brand.name} says so. Expand the models consulted, sources, disagreements, verification, and a reasoning
            summary whenever you want to see how the answer was formed.
          </p>
          <h2>For everyday life, and for work</h2>
          <p>
            Ask about a chapter you&apos;re studying, a medication leaflet, a car you&apos;re thinking of buying, a trip, or
            something you read online. Attach a file, an image, or a short video, and {brand.name} shows where the models agree
            and where they don&apos;t. Health and money answers are general information, not professional advice, and web
            lookups aren&apos;t live yet, so check what matters.
          </p>
          <p>
            Switch to creation in the same thread to build a personal site, an app, images, video, or code. Power users can
            adjust routing, but you never have to pick models to get a good answer. {brand.engineName} does that for you.
          </p>
          <h2>Run a business? It can run with you</h2>
          <p>
            Business is optional: commerce, a CRM and inbox, a dashboard, and agents that work inside spend caps and approval
            gates. See <a href={businessUrl("/")}>{brand.name} Business</a>, everyday uses on{" "}
            <Link href="/for-you">for you</Link>, <Link href="/pricing">pricing</Link>, or <Link href="/app">try it now</Link>.
          </p>
          <p>
            Answers are where {brand.name} starts. It also studies with you, researches, makes slides, images and video, builds and
            publishes websites and apps, builds Roblox games in Roblox Studio, and runs agents. See{" "}
            <Link href="/what-is-keplar">everything Keplar does</Link>.
          </p>
        </div>
      </section>
      <Creation />
      <LearnLinks />
      <FinalCta />
    </>
  );
}
