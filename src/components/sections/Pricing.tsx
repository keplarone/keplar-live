import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { PlanCta } from "@/components/billing/PlanCta";
import { computeAllowance, computeScale, formatPrice, SHOW_COMPUTE_ALLOWANCES, tiers } from "@/lib/tiers";
import { pricingCopy } from "@/lib/sections";
import { getMessages } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { MoreButton, MoreRoot } from "@/components/ui/MobileMore";
import { referralConfig } from "@/lib/referrals/config";
import { SectionHeader } from "./SectionHeader";
import s from "./Pricing.module.css";

/** Four plans as one systematic row of calm cards (docs/ui-v2.md). Plus, the recommended plan, carries an ink edge and the one
 *  primary button; there is no "most popular" badge and no urgency.
 *  Phones (640px and narrower) show each plan's price, summary, first `phoneFeatures` features and button; the rest of the list
 *  folds behind "See everything in <plan>" (src/components/ui/MobileMore.tsx). Every feature stays in the page. */
export async function Pricing({ headingLevel = "h2", showCompute = true, locale = "en", phoneFeatures = 4 }: { headingLevel?: "h1" | "h2"; showCompute?: boolean; locale?: string; phoneFeatures?: number }) {
  const Sub = headingLevel === "h1" ? "h2" : "h3";
  // Plan names and USD prices are never translated; summaries, features and labels are (English: src/lib/tiers.ts, src/lib/sections.ts).
  const p = (await getMessages(locale, "marketing")).pricing;
  const ref = referralConfig();
  return (
    <section className={s.section} aria-labelledby="pricing-title">
      <div className={s.inner}>
        <SectionHeader tone="ink" id="pricing-title" as={headingLevel} label={p.label} title={p.title} lede={p.lede} align="split" size={headingLevel === "h1" ? "display" : "headline"} />

        <ul className={s.plans} data-reveal-stagger>
          {tiers.map((t) => {
            const x = p.tiers[t.id] ?? { summary: t.summary, features: t.features, cta: t.cta.label };
            return (
            <MoreRoot as="li" key={t.id} className={s.plan} data-plan={t.id} data-reveal>
              <Sub className={s.name}>{t.name}</Sub>
              <p className={s.price}>
                {/* The real price, always: a count-up from $0 read as "$0 per month" to find-in-page, translation and assistive tech. */}
                <span className={s.amount}>{t.price === null ? p.custom : formatPrice(t)}</span>
                <span className={s.cadence}>{t.price === null ? p.tailored : (p.cadence[t.cadence] ?? t.cadence)}</span>
              </p>
              <p className={s.summary}>{x.summary}</p>
              {SHOW_COMPUTE_ALLOWANCES && computeAllowance(t.id) ? <p className={s.cadence}>{computeAllowance(t.id)}</p> : null}
              <ul className={s.features}>
                {x.features.map((f, i) => (
                  <li key={f} data-more-rest={i >= phoneFeatures ? "" : undefined}>{f}</li>
                ))}
              </ul>
              {x.features.length > phoneFeatures ? (
                <MoreButton more={fmt(p.seeAll, { plan: t.name })} less={p.showLess} className={s.more} />
              ) : null}
              <div className={s.cta}>
                {t.id === "business" ? (
                  <ButtonLink href={t.cta.href} variant="secondary" arrow>
                    {x.cta}
                  </ButtonLink>
                ) : (
                  <PlanCta plan={t.id} label={x.cta} href={t.cta.href} primary={t.id === "plus"} />
                )}
              </div>
            </MoreRoot>
            );
          })}
        </ul>

        <p className={s.fine}>{p.fine}</p>
        {/* English only: the other locales have no translated copy for it yet. */}
        {locale === "en" && ref.enabled ? (
          <p className={s.fine}>
            Invite a friend: when they sign up with your link, you get {ref.referrerCredits.toLocaleString("en-US")} and they get {ref.friendCredits.toLocaleString("en-US")} extra usage credits. <Link href="/account#invite">Get your link</Link> · <Link href="/referral-terms">Terms</Link>
          </p>
        ) : null}

        {showCompute ? (
          <div className={s.compute}>
            <div>
              <Sub className={s.computeTitle}>{pricingCopy.computeTitle}</Sub>
              <p className={s.computeLede}>{pricingCopy.computeLede}</p>
            </div>
            <dl className={s.scale}>
              {computeScale.map((c, i) => (
                <div key={c.task} className={s.scaleRow}>
                  <dt>{c.task}</dt>
                  <dd>
                    <span className={s.bars} aria-hidden="true">
                      {Array.from({ length: 4 }, (_, k) => (
                        <i key={k} data-on={k <= Math.min(i, 3) || undefined} />
                      ))}
                    </span>
                    {c.cost}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
