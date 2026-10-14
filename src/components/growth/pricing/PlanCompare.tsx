import { Fragment } from "react";
import { PlanCta } from "@/components/billing/PlanCta";
import { TrackedLink } from "@/components/growth/TrackedLink";
import { compareGroups, PLAN_ORDER } from "@/lib/growth/pricing-page";
import { tiers } from "@/lib/tiers";
import s from "./pricing.module.css";

const NAME: Record<string, string> = Object.fromEntries(tiers.map((t) => [t.id, t.name.replace("Keplar ", "")]));

/**
 * Full plan comparison, generated from the modules that enforce each limit (src/lib/growth/pricing-page.ts).
 * A real <table> (caption, column and row headers) inside a keyboard-scrollable region, so narrow screens scroll sideways
 * with the feature column pinned instead of squeezing five plans into 375 px.
 */
export function PlanCompare() {
  return (
    <section className={s.section} aria-labelledby="compare-title">
      <div className={s.inner}>
        <h2 id="compare-title" className={s.title}>Compare every plan</h2>
        <p className={s.lede}>Every limit below is the one the product enforces today. Anything marked Coming soon is not available yet.</p>
        <div className={s.scroller} role="region" aria-labelledby="compare-title" tabIndex={0}>
          <table className={s.table}>
            <caption className="visually-hidden">Keplar plans compared feature by feature</caption>
            <thead>
              <tr>
                <th scope="col" className={s.featureHead}>Feature</th>
                {PLAN_ORDER.map((p) => (
                  <th key={p} scope="col" data-plan={p}>{NAME[p]}</th>
                ))}
              </tr>
            </thead>
            {compareGroups.map((g) => (
              <tbody key={g.title}>
                <tr className={s.groupRow}>
                  <th scope="colgroup" colSpan={PLAN_ORDER.length + 1}>{g.title}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className={s.feature}>
                      {r.label}
                      {r.hint ? <span className={s.hint}>{r.hint}</span> : null}
                    </th>
                    {PLAN_ORDER.map((p) => {
                      const v = r.values[p];
                      return (
                        <td key={p} data-plan={p} data-soon={v === "Coming soon" || undefined}>
                          {v === null ? (
                            <Fragment>
                              <span aria-hidden="true" className={s.dash}>—</span>
                              <span className="visually-hidden">Not included</span>
                            </Fragment>
                          ) : (
                            v
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th scope="row" className={s.feature}><span className="visually-hidden">Choose a plan</span></th>
                {PLAN_ORDER.map((p) => {
                  const t = tiers.find((x) => x.id === p)!;
                  return (
                    <td key={p} data-plan={p} className={s.ctaCell}>
                      {p === "business" ? (
                        <TrackedLink where="pricing:compare-business" href={t.cta.href} variant="secondary">Contact</TrackedLink>
                      ) : (
                        <PlanCta plan={p} label={p === "free" ? "Start free" : `Get ${NAME[p]}`} href={t.cta.href} primary={p === "plus"} />
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
