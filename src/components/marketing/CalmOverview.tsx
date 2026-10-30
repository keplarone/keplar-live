import Link from "next/link";
import { ButtonLink } from "@/components/orbit";
import { localizedPath } from "@/lib/i18n/routing";
import { PRODUCT_SHOTS } from "./product-shots";
import s from "./Overview.module.css";

/** How it works, in the lede's own words (no new claims): the three steps of every answer. */
const STEPS = [
  { n: "01", title: "Ask", text: "Ask once. Keplar picks the models your question needs." },
  { n: "02", title: "Compare", text: "It shows where the models agree and where they disagree." },
  { n: "03", title: "Answer", text: "Then it writes one answer from what held up." },
] as const;

/**
 * The marketing landing (Keplar Orbit, docs/design/keplar-orbit.md §4 Marketing). A calm sky behind the hero only, then the real
 * product in device-less panes on the 12-column grid, alternating sides, a three-step row and one closing call to action.
 * No invented proof, no model-provider names.
 */
export function CalmOverview({ locale }: { locale?: string }) {
  const pricing = localizedPath("/pricing", locale ?? "en");
  return (
    <article className={s.page} data-overview="">
      <header className={s.hero}>
        <div className={s.sky} aria-hidden="true">
          <i />
          <i />
        </div>
        <div className={s.heroInner}>
          <p className={s.badge}>Keplar One</p>
          <h1 className={s.h1}>Several models. One answer.</h1>
          <p className={s.lede}>
            Keplar asks the models your question needs, shows where they disagree, and writes one answer. Free to try.
          </p>
          <div className={s.ctaRow}>
            <ButtonLink href="/" variant="primary" size="lg" intent="send">Ask Keplar</ButtonLink>
            <ButtonLink href={pricing} variant="secondary" size="lg">Pricing</ButtonLink>
          </div>
        </div>
      </header>

      {PRODUCT_SHOTS.map((shot, i) => (
        <section key={shot.src} className={`${s.section} o-grid`} data-flip={i % 2 === 1 || undefined}>
          <div className={s.copy}>
            <p className={s.step}>{String(i + 1).padStart(2, "0")}</p>
            <h2>{shot.title}</h2>
            <p>{shot.text}</p>
          </div>
          <figure className={`${s.frame} o-pane`}>
            <img src={shot.src} alt={shot.alt} width={1440} height={900} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
          </figure>
        </section>
      ))}

      <section className={`${s.how} o-grid`} aria-labelledby="overview-how">
        <h2 id="overview-how" className={s.howTitle}>How an answer is made</h2>
        <ol className={s.steps}>
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className={s.stepN}>{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.close} aria-labelledby="overview-close">
        <h2 id="overview-close">Free to try.</h2>
        <p>No account needed to ask your first question.</p>
        <div className={s.ctaRow}>
          <ButtonLink href="/" variant="primary" size="lg" intent="send">Ask Keplar</ButtonLink>
        </div>
        <p className={s.more}>
          <Link href={pricing}>Pricing</Link>
          <Link href="/docs">Docs</Link>
        </p>
      </section>
    </article>
  );
}
