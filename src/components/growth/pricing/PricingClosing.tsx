import { TrackedLink } from "@/components/growth/TrackedLink";
import { getMessages } from "@/lib/i18n/server";
import s from "./pricing.module.css";

/** Quiet closing call to action. Shown once at the end of the page; no pop-ups, no exit intent. */
export async function PricingClosing({ locale = "en" }: { locale?: string }) {
  const p = (await getMessages(locale, "marketing")).pricing;
  return (
    <section className={s.section} aria-labelledby="closing-title">
      <div className={`${s.inner} ${s.closing}`}>
        <h2 id="closing-title" className={s.title}>{p.closingTitle}</h2>
        <p className={s.lede}>{p.closingLede}</p>
        <div className={s.closingRow}>
          <TrackedLink where="pricing:closing" href="/app" size="lg" arrow magnetic={false}>{p.closingAsk}</TrackedLink>
          <TrackedLink where="pricing:closing-compare" href="/vs" size="lg" variant="secondary" magnetic={false}>{p.closingCompare}</TrackedLink>
        </div>
      </div>
    </section>
  );
}
