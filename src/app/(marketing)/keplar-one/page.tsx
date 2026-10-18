import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { KeplarOnePipeline } from "@/components/sections/KeplarOnePipeline";
import { FinalCta } from "@/components/sections/FinalCta";
import { demoAnswer } from "@/lib/demo";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import s from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/keplar-one",
  `${brand.engineName}: the intelligence behind the intelligences`,
  `${brand.engineName} classifies each task, selects only the AI models it needs by quality, reliability, latency, and cost, compares their reasoning, weighs the evidence behind it, and synthesizes one answer.`,
);

export default function KeplarOnePage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Keplar-One engine", path: "/keplar-one" }])} />
      <PageHero
        label={brand.engineName}
        title="The intelligence behind the intelligences."
        lede={`${brand.engineName} is ${brand.name}'s orchestration layer. It isn't a single model. It decides which AI models to ask, compares their answers, weighs the evidence behind them, and writes the final answer.`}
        ctas={[{ href: "/app", label: `Try ${brand.name}` }, { href: "/pricing", label: "See pricing", variant: "secondary" }]}
      />
      <section className={s.section} style={{ paddingTop: "var(--s-12)" }} aria-label={`${brand.engineName} pipeline`}>
        <div className={s.inner}>
          <KeplarOnePipeline />
        </div>
      </section>
      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={`${s.inner} ${s.prose}`}>
          <h2>How {brand.engineName} chooses models</h2>
          <p>
            Every question starts with classification: what kind of task it is and how complex it is. A quick factual question
            doesn&apos;t need the same line-up as a decision about buying a home. {brand.engineName} weighs each candidate model by{" "}
            <strong>quality, reliability, latency, and cost</strong>, then asks only the ones the question needs. Not every model,
            every time. That keeps answers fast and keeps {brand.usage} usage honest.
          </p>
          <h2>Why disagreement matters</h2>
          <p>
            Models run independently and in parallel, so one answer doesn&apos;t anchor the others. When they agree, that is
            useful. When they don&apos;t, it is more useful: disagreement is where a single model&apos;s blind spot usually shows.{" "}
            {brand.engineName} flags it instead of silently picking one answer, and investigates why the responses differ.
          </p>
          <h2>Evaluation, not voting</h2>
          <p>
            A majority isn&apos;t treated as the truth, because consensus can be wrong. {brand.name} weighs the evidence and reasoning
            behind each response. If the one dissenting model has the better argument, that counts for more than the headcount,
            and the parts of the dissent that hold up shape the final answer.
          </p>
          <h2>What you see in every answer</h2>
          <p>
            One {brand.answer}, attributed to {brand.engineName}. Below it, every part of how it was formed is one click away:
          </p>
          <ul className={s.steps}>
            {demoAnswer.sections.map((sec) => (
              <li key={sec.id}>
                <span className={s.stepName}>{sec.title}</span>
                <span>{sec.body.split(". ")[0]}.</span>
              </li>
            ))}
          </ul>
          <p>
            {brand.engineName} is the engine; see <Link href="/what-is-keplar">everything Keplar does</Link> around it. See it
            end to end on the <Link href="/how-it-works">how it works</Link> page, explore the{" "}
            <Link href="/product">product</Link>, compare <Link href="/pricing">plans</Link>, or{" "}
            <Link href="/app">ask your first question</Link>.
          </p>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
