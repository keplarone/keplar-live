import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import Link from "next/link";
import { HeroField } from "@/components/motion/HeroField";
import { PageHero } from "@/components/page/PageHero";
import { Everyday } from "@/components/sections/Everyday";
import { Creation } from "@/components/sections/Creation";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import { businessUrl } from "@/lib/business-site";
import s from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/for-you",
  "Keplar for you: everyday questions, one answer",
  "Studying, health questions, money and big purchases, travel, fact-checking, writing, and personal projects. Keplar asks several AI models, shows where they disagree, and gives you one answer. Free to start.",
);

export default function ForYouPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "For you", path: "/for-you" }])} />
      <HeroField variant="foryou" />
      <PageHero
        label="For you"
        title="One answer you can inspect, for everyday questions."
        lede={`Every AI model has blind spots. ${brand.name} asks the models your question needs, shows you where they agree and where they don't, and writes one answer. Start free, no card needed.`}
        ctas={[{ href: "/app", label: `Ask ${brand.name}` }, { href: "/signup", label: "Create a free account", variant: "secondary" }]}
      />
      <Everyday showCta={false} id="for-you-uses" />
      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={`${s.inner} ${s.prose}`}>
          <h2>Why several models help with everyday questions</h2>
          <p>
            One AI can sound sure and still be wrong. When several models answer on their own, disagreement is a useful signal: it
            shows you the part of the answer to double-check, the question to ask your teacher or doctor, or the trade-off
            you hadn&apos;t thought about. {brand.name} flags it instead of hiding it.
          </p>
          <h2>Honest about limits</h2>
          <p>
            {brand.name} can be wrong, even when the models agree. Health, legal, and money answers are general information, not
            professional advice. {brand.name} doesn&apos;t look things up on the web yet, so for news and fast-changing facts,
            check a primary source. The Free plan runs on free open models, which can be slower when they&apos;re busy.
          </p>
          <h2>Make things, too</h2>
          <p>
            On Plus and Pro, the same thread can turn into a personal site, a portfolio, an invitation, images, or a short video,
            published on your own domain if you like. See <Link href="/pricing">plans</Link>, or{" "}
            <Link href="/how-it-works">how it works</Link>.
          </p>
          <p>
            Run a business as well? <a href={businessUrl("/")}>{brand.name} Business</a> is optional, and adds the tools
            around your work.
          </p>
        </div>
      </section>
      <Creation />
      <Faq items={["Is Keplar for personal use or for businesses?", "Can I ask Keplar health or money questions?", "Does agreement mean the answer is correct?", "How much does Keplar cost?"]} />
      <FinalCta />
    </>
  );
}
