import { PlanCta } from "@/components/billing/PlanCta";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { planFits } from "@/lib/growth/pricing-page";
import { tiers } from "@/lib/tiers";
import { getMessages } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import s from "./pricing.module.css";

/** "Which plan fits?" Plans described by who they are for and what changes, not by a feature list. No "most popular" badge. */
export async function PlanFit({ locale = "en" }: { locale?: string }) {
  const p = (await getMessages(locale, "marketing")).pricing;
  return (
    <section className={s.section} aria-labelledby="fit-title">
      <div className={s.inner}>
        <h2 id="fit-title" className={s.title}>{p.fitTitle}</h2>
        <ul className={s.fits}>
          {planFits.map((f) => {
            const t = tiers.find((x) => x.id === f.plan)!;
            const x = p.fits[f.plan] ?? { who: f.who, outcome: f.outcome, cta: f.cta.label };
            return (
              <li key={f.plan} className={s.fit}>
                <p className={s.fitPlan}>
                  <span>{t.name.replace("Keplar ", "")}</span>
                  <span className={s.fitPrice}>{t.price === null ? p.custom : t.price === 0 ? "$0" : fmt(p.perMonth, { price: `$${t.price}` })}</span>
                </p>
                <h3 className={s.fitWho}>{x.who}</h3>
                <p className={s.fitOutcome}>{x.outcome}</p>
                <div className={s.fitCta}>
                  {f.plan === "business" ? (
                    <TrackedLink where="pricing:fit-business" href={f.cta.href} variant="secondary" magnetic={false}>{x.cta}</TrackedLink>
                  ) : f.plan === "free" ? (
                    <TrackedLink where="pricing:fit-free" href={f.cta.href} variant="secondary" magnetic={false}>{x.cta}</TrackedLink>
                  ) : (
                    <PlanCta plan={f.plan as "plus" | "pro"} label={x.cta} href={f.cta.href} primary={f.plan === "plus"} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
