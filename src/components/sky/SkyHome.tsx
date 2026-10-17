import Link from "next/link";
import { LiveDemo } from "@/components/landing/LiveDemo";
import { CHAPTERS } from "@/lib/features";
import { allUseCases } from "@/lib/kb/usecases";
import { brand, tryHref } from "@/lib/site";
import { referralConfig } from "@/lib/referrals/config";
import { ScrollZoom } from "./ScrollZoom";
import { ModelStack } from "./ModelStack";
import { DemoWindow } from "./DemoWindow";
import { FeatureList } from "./FeatureList";
import { ParticleStory } from "./ParticleStory";
import { HeroCta } from "@/components/growth/HeroCta";
import { MoreButton, MoreRoot } from "@/components/ui/MobileMore";
import s from "./Sky.module.css";

/** Use cases shown on the home, in this order (slugs from content/use-cases), each with its icon stroke colour. */
const USE_CASES: { slug: string; color: string; icon: React.ReactNode }[] = [
  { slug: "research-a-new-topic", color: "#0b5f70", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
  { slug: "check-a-claim-before-sharing", color: "#1f7a4a", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { slug: "compare-options-before-buying", color: "#8a5a00", icon: <path d="M7 7h10M7 12h10M7 17h6" /> },
  { slug: "get-a-second-opinion-on-code", color: "#8a4550", icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /> },
  { slug: "study-for-an-exam", color: "#4a63b8", icon: <><path d="M4 6l8-3 8 3-8 3-8-3z" /><path d="M8 8v5c0 1.5 2 3 4 3s4-1.5 4-3V8" /></> },
  { slug: "understand-a-document", color: "#8a4f24", icon: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></> },
];

/** Phones show this many use cases; the rest fold behind "Show more" (src/components/ui/MobileMore.tsx). */
const PHONE_CASES = 3;

const STEPS = [
  { title: "Ask once", body: "Type your question the way you would anywhere else. You don't need to pick a model." },
  { title: "Several models answer", body: "Keplar sends it to the models your question needs, at the same time, and reads every response." },
  { title: "You get one answer", body: "Their views are compared claim by claim and combined into one answer, with any disagreement shown." },
];

/** The home: a calm cloud sky, hero, product window, feature list, the three steps, use cases and the live demo. */
export function SkyHome({ pricing }: { pricing?: React.ReactNode }) {
  const cases = allUseCases();
  const useCases = USE_CASES.map((u) => ({ ...u, data: cases.find((c) => c.slug === u.slug) })).filter((u) => u.data);
  const [, ...chapters] = CHAPTERS;
  const ref = referralConfig();

  return (
    <div className={s.home}>
      <section className={s.hero} aria-labelledby="hero-title">
        <p className={s.badge}>
          <ModelStack />
          <span>Top AI models, one answer</span>
        </p>
        <h1 id="hero-title" className={s.h1}>
          <span>One question.</span>
          <span className={s.muted}>Multiple intelligences.</span>
          <span>One answer.</span>
        </h1>
        <p className={s.lede}>{brand.name} uses multiple AI models, compares their perspectives, and gives you one clear, synthesized answer.</p>
        <div className={s.ctas}>
          <HeroCta href={tryHref} className={`sp-btn ${s.btnPrimary}`} />
          <Link href="/download" className={`sp-btn ${s.btnSecondary}`} data-sp-btn="" data-variant="secondary" data-size="lg" data-desktop-only="">
            <span className="sp-btn__label" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            </span>
            Download for desktop
          </Link>
        </div>
      </section>

      <ScrollZoom className={s.previewWrap}>
        <DemoWindow />
        <p className={s.note}>Example answer, shown for illustration.</p>
      </ScrollZoom>

      <section className={s.section} aria-labelledby="everything-title">
        <h2 id="everything-title" className={s.h2}><span>Everything in {brand.name}.</span> <span className={s.muted}>One place.</span></h2>
        {/* The hero already covers chapter 01 (Ask), so the list numbers what it shows: 01-06, not 02-07. */}
        <FeatureList rows={chapters.map(({ id, label, title }, i) => ({ id, n: String(i + 1).padStart(2, "0"), label, title }))} />
      </section>

      <ParticleStory title={`How ${brand.name} works.`} muted="Three steps, a few seconds." steps={STEPS} />

      <section className={s.section} aria-labelledby="cases-title">
        <h2 id="cases-title" className={s.h2}><span>Built for questions that matter.</span> <span className={s.muted}>And everyday ones too.</span></h2>
        <MoreRoot className={s.casesWrap}>
          <ul className={s.cards3} data-reveal-stagger>
            {useCases.map((u, i) => (
              <li key={u.slug} data-more-rest={i >= PHONE_CASES ? "" : undefined}>
                <Link href={u.data!.path} className={`${s.card} ${s.cardLink}`} data-reveal="">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={u.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{u.icon}</svg>
                  <h3>{u.data!.title}</h3>
                  <p>{u.data!.description}</p>
                </Link>
              </li>
            ))}
          </ul>
          <MoreButton more={`Show ${useCases.length - PHONE_CASES} more use cases`} less="Show fewer use cases" className={s.moreBtn} />
        </MoreRoot>
      </section>

      <section id="demo" className={s.section} aria-labelledby="demo-title">
        <div className={s.demo}>
          <h2 id="demo-title" className={s.h2}><span>Try it here.</span> <span className={s.muted}>No account needed.</span></h2>
          <LiveDemo />
        </div>
      </section>

      {ref.enabled ? (
        <section className={s.section} aria-labelledby="invite-title">
          <div className={s.invite} data-reveal>
            <h2 id="invite-title" className={s.h2}><span>Invite a friend.</span> <span className={s.muted}>You both get extra credit.</span></h2>
            <p className={s.lede}>
              Share your link. When a friend creates a new account with it and verifies their email, you get {ref.referrerCredits.toLocaleString("en-US")} and they get {ref.friendCredits.toLocaleString("en-US")} extra usage credits on Lite, Plus or Pro.
            </p>
            <div className={s.ctas}>
              <Link href="/account#invite" className={s.btnPrimary}>Get your invite link</Link>
              <Link href="/referral-terms" className={s.btnSecondary}>Referral terms</Link>
            </div>
            <p className={s.note}>Usage credit only, never cash. Up to {ref.perMonth} rewarded friends a month.</p>
          </div>
        </section>
      ) : null}

      {pricing}
    </div>
  );
}
