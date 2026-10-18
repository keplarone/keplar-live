import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { StepDiagram } from "@/components/how/StepDiagram";
import { Faq } from "@/components/sections/Faq";
import { LearnLinks } from "@/components/sections/LearnLinks";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import { formatPrice, tiers } from "@/lib/tiers";
import s from "./how.module.css";
import { TwoTone } from "@/components/page/TwoTone";

// Copy: /workspace/marketing/launch/how-it-works-page.md (revision of Sep 27, 2026).
export const metadata = pageMeta(
  "/how-it-works",
  "How Keplar Works: Multiple AI Models, One Answer",
  "Keplar-One picks the models your question needs, compares answers claim by claim, investigates disagreement, verifies and writes one answer. Try it free.",
  { absoluteTitle: true },
);

const O = brand.engineName;
const K = brand.name;
const KO = brand.companyName;

// Verbatim from how-it-works-page.md "Common questions" (answer 3 deliberately differs from faq-final.md).
const questions = [
  {
    q: `Does ${K} ask every AI model every time?`,
    a: `No. ${O} picks only the models a question needs, weighed by quality, reliability, latency, and cost.`,
  },
  {
    q: "What happens when the models disagree?",
    a: `${K} flags the disagreement instead of silently picking one answer. It evaluates the reasoning and evidence behind each response, because the minority can be right.`,
  },
  {
    q: "Does agreement mean the answer is correct?",
    a: `Not always. Consensus can be wrong. That's why ${K} weighs the evidence and reasoning behind each response, and shows how strongly the models agreed rather than treating a majority as the truth.`,
  },
];

const steps: { n: 1 | 2 | 3 | 4 | 5 | 6; title: string; lead: string; body: ReactNode }[] = [
  {
    n: 1,
    title: "You ask one question",
    lead: "Type it the way you'd ask a friend who knows a lot.",
    body: (
      <>
        <blockquote className={s.quote}>“Should I buy a home this year or keep renting?”</blockquote>
        <p>No need to pick models or paste the same prompt into five tabs.</p>
      </>
    ),
  },
  {
    n: 2,
    title: `${O} decides who to ask`,
    lead: "Not every model, every time. Only the intelligences this question needs, weighed by quality, reliability, latency, and cost.",
    body: (
      <p>
        A quick factual question doesn&apos;t need the same line-up as a decision about buying a home or entering a new market. {O} can route across multiple
        model families and picks per question, based on what the question needs and what it costs.
      </p>
    ),
  },
  {
    n: 3,
    title: "Each model answers on its own",
    lead: "Different reasoning. Different evidence.",
    body: <p>The models work independently, so one answer doesn&apos;t anchor the others. You get separate points of view, not an echo.</p>,
  },
  {
    n: 4,
    title: `${K} finds the disagreement`,
    lead: `5 agree. 1 doesn't. ${K} investigates why.`,
    body: <p>Where the models agree, that&apos;s noted. Where they don&apos;t, {K} flags it instead of silently picking one answer.</p>,
  },
  {
    n: 5,
    title: "Evaluation, not voting",
    lead: `${K} weighs the evidence and reasoning behind each response. A majority isn't treated as the truth, because consensus can be wrong.`,
    body: <p>The minority can be right. If the one dissenting model has the better evidence, that counts for more than the headcount.</p>,
  },
  {
    n: 6,
    title: "One answer",
    lead: "Synthesized from what held up, with the agreement and disagreements shown.",
    body: (
      <>
        <p>Every synthesized answer is attributed to {O}. Below it, you can expand:</p>
        <dl className={s.defs}>
          <div><dt>Consensus</dt><dd>how many models agreed, as counts such as &quot;4 of 5&quot;, never a percentage of correctness</dd></div>
          <div><dt>Models consulted</dt><dd>which models {O} asked</dd></div>
          <div><dt>Sources</dt><dd>the sources the models cite ({K} hasn&apos;t checked them)</dd></div>
          <div><dt>Disagreements</dt><dd>which model or models disagreed, and a summary of what they concluded differently</dd></div>
          <div><dt>Verification</dt><dd>how {K} checked its answer. A verifier model reviews the reasoning, flags contradictions between models, and notes how each was resolved. For simple questions answered by one model, it says no cross-model check was needed.</dd></div>
          <div><dt>Reasoning summary</dt><dd>how the answer was put together</dd></div>
        </dl>
      </>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <>
    <JsonLd data={breadcrumbs([{ name: "How it works", path: "/how-it-works" }])} />
    <article className={s.page}>
      <header className={s.hero}>
        <p className={s.kicker}>How it works</p>
        <h1 className={s.h1}><TwoTone text={"Stop trusting one AI."} /></h1>
        <p className={s.sub}>One question. Multiple intelligences. One answer.</p>
        <p className={s.intro}>
          Every AI model has blind spots. {KO} asks the models your question needs, evaluates what they say, and gives you one
          answer you can inspect.
        </p>
        <div className={s.ctas}>
          <ButtonLink href="/app" arrow size="lg">Try it free</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" size="lg">See pricing</ButtonLink>
        </div>
      </header>

      <ol className={s.steps} data-reveal-stagger>
        {steps.map((st) => (
          <li key={st.n} className={s.step} data-reveal>
            <div>
              <p className={s.num}>{String(st.n).padStart(2, "0")}</p>
              <h2 className={s.h2}>{st.title}</h2>
              <p className={s.lead}>{st.lead}</p>
              <div className={s.body}>{st.body}</div>
            </div>
            <figure className={s.figure}>
              <StepDiagram step={st.n} />
            </figure>
          </li>
        ))}
      </ol>

      <section className={s.plans} aria-labelledby="plans-title">
        <h2 id="plans-title" className={s.h2}>Plans</h2>
        <dl className={s.planList}>
          {tiers.map((t) => (
            <div key={t.id}>
              <dt>{t.id === "business" ? `${K} Business` : t.name}</dt>
              <dd>
                {t.price === null ? (
                  <>
                    custom. <Link href={brand.contactPath}>Inquire</Link>
                  </>
                ) : t.price === 0 ? (
                  formatPrice(t)
                ) : (
                  `${formatPrice(t)}/month`
                )}
              </dd>
            </div>
          ))}
        </dl>
        <Link href="/pricing" className={s.more}>Compare plans →</Link>
      </section>

      <Faq title="Common questions" entries={questions} />

      <LearnLinks />

      <section className={s.closing} aria-labelledby="closing-title">
        <h2 id="closing-title" className={s.h2}>Ask your first question</h2>
        <ButtonLink href="/app" arrow size="lg">Try it free</ButtonLink>
      </section>
    </article>
    </>
  );
}
