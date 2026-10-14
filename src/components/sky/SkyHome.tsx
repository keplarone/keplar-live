import Link from "next/link";
import { KeplarSymbol } from "@/components/brand";
import { LiveDemo } from "@/components/landing/LiveDemo";
import { ButtonLink } from "@/components/ui/Button";
import { HeroCta } from "@/components/growth/HeroCta";
import { CHAPTERS } from "@/lib/features";
import { allUseCases } from "@/lib/kb/usecases";
import { brand, tryHref } from "@/lib/site";
import { DemoWindow } from "./DemoWindow";
import { FeatureList } from "./FeatureList";
import b from "@/components/ui/Button.module.css";
import s from "./Sky.module.css";

/** Use cases shown on the home, in this order (slugs from content/use-cases), each with its line icon. */
const USE_CASES: { slug: string; icon: React.ReactNode }[] = [
  { slug: "research-a-new-topic", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
  { slug: "check-a-claim-before-sharing", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { slug: "compare-options-before-buying", icon: <path d="M7 7h10M7 12h10M7 17h6" /> },
  { slug: "get-a-second-opinion-on-code", icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /> },
  { slug: "study-for-an-exam", icon: <><path d="M4 6l8-3 8 3-8 3-8-3z" /><path d="M8 8v5c0 1.5 2 3 4 3s4-1.5 4-3V8" /></> },
  { slug: "understand-a-document", icon: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></> },
];

const STEPS = [
  { title: "Ask once", body: "Type your question the way you would anywhere else. You don't need to pick a model." },
  { title: "Several models answer", body: "Keplar sends it to the models your question needs, at the same time, and reads every response." },
  { title: "You get one answer", body: "Their views are compared claim by claim and combined into one answer, with any disagreement shown." },
];

function SectionHead({ id, kicker, title, lead }: { id: string; kicker: string; title: string; lead: string }) {
  return (
    <header className={s.head} data-reveal="">
      <p className={s.kicker}>{kicker}</p>
      <h2 id={id} className={s.h2}>{title}</h2>
      <p className={s.lead}>{lead}</p>
    </header>
  );
}

/**
 * The public home on the UI v2 system (docs/ui-v2.md): plain canvas, the Keplar mark, one headline, one ink action, then the
 * product window as a calm raised surface. Below: the "Everything in Keplar" list (src/lib/features.ts), how it works, use cases
 * (content/use-cases), the live demo (#demo) and pricing. Scroll motion is only the shared [data-reveal] fade and rise.
 */
export function SkyHome({ pricing }: { pricing?: React.ReactNode }) {
  const cases = allUseCases();
  const useCases = USE_CASES.map((u) => ({ ...u, data: cases.find((c) => c.slug === u.slug) })).filter((u) => u.data);
  const [, ...chapters] = CHAPTERS;

  return (
    <div className={s.home}>
      <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
        <KeplarSymbol size={40} className={s.mark} />
        <p className={s.kicker}>Top AI models, one answer</p>
        <h1 id="hero-title" className={s.h1}>
          <span>One question.</span> <span>Multiple intelligences.</span> <span>One answer.</span>
        </h1>
        <p className={s.lede}>{brand.name} uses multiple AI models, compares their perspectives, and gives you one clear, synthesized answer.</p>
        <div className={s.ctas}>
          <HeroCta href={tryHref} className={`${b.button} ${b.primary} ${b.lg}`} />
          <ButtonLink href="/download" variant="secondary" size="lg" data-desktop-only="">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Download for desktop
          </ButtonLink>
        </div>
      </section>

      <div className={s.preview}>
        <DemoWindow />
        <p className={s.note}>Example answer, shown for illustration.</p>
      </div>

      <section className={`${s.wrap} ${s.section}`} aria-labelledby="everything-title">
        <SectionHead id="everything-title" kicker="Features" title={`Everything in ${brand.name}.`} lead="One place." />
        {/* The hero already covers chapter 01 (Ask), so the list numbers what it shows: 01-06, not 02-07. */}
        <FeatureList rows={chapters.map(({ id, label, title }, i) => ({ id, n: String(i + 1).padStart(2, "0"), label, title }))} />
      </section>

      <section className={`${s.wrap} ${s.section}`} aria-labelledby="how-title">
        <SectionHead id="how-title" kicker="How it works" title={`How ${brand.name} works.`} lead="Three steps, a few seconds." />
        <ol className={s.grid3}>
          {STEPS.map((st, i) => (
            <li key={st.title} className={s.card} data-reveal="">
              <span className={s.stepN}>{String(i + 1).padStart(2, "0")}</span>
              <h3>{st.title}</h3>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${s.wrap} ${s.section}`} aria-labelledby="cases-title">
        <SectionHead id="cases-title" kicker="Use cases" title="Built for questions that matter." lead="And everyday ones too." />
        <ul className={s.grid3}>
          {useCases.map((u) => (
            <li key={u.slug} data-reveal="">
              <Link href={u.data!.path} className={`${s.card} ${s.cardLink}`}>
                <span className={s.icon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{u.icon}</svg>
                </span>
                <h3>{u.data!.title}</h3>
                <p>{u.data!.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="demo" className={`${s.wrap} ${s.section}`} aria-labelledby="demo-title">
        <SectionHead id="demo-title" kicker="Live demo" title="Try it here." lead="No account needed." />
        <LiveDemo />
      </section>

      {pricing}
    </div>
  );
}
