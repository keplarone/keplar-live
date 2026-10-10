import { enterpriseCopy } from "@/lib/sections";
import { ButtonLink } from "@/components/ui/Button";
import { brand } from "@/lib/site";
import { SectionHeader } from "./SectionHeader";
import s from "./Enterprise.module.css";

/**
 * Architectural composition: a transparent perimeter drawn in hairlines, agents
 * moving inside it, and the six controls annotated on its edges like a plan drawing.
 */
export function Enterprise({ headingLevel = "h2", showCta = true }: { headingLevel?: "h1" | "h2"; showCta?: boolean }) {
  const agents = Array.from({ length: 7 }, (_, i) => i);
  return (
    <section className={s.section} aria-labelledby="enterprise-title">
      <div className={s.inner}>
        <div className={s.copy}>
          <SectionHeader tone="attention" id="enterprise-title" as={headingLevel} label={enterpriseCopy.label} title={enterpriseCopy.title} lede={enterpriseCopy.lede} />
          {showCta ? (
            <div className={s.cta}>
              <ButtonLink href={brand.contactPath} arrow>
                {enterpriseCopy.cta}
              </ButtonLink>
            </div>
          ) : null}
        </div>

        <div className={s.drawing} aria-hidden="true">
          <div className={s.boundary}>
            <span className={s.cornerTL} />
            <span className={s.cornerTR} />
            <span className={s.cornerBL} />
            <span className={s.cornerBR} />
            {agents.map((i) => (
              <span key={i} className={s.agent} style={{ ["--i" as string]: i }} />
            ))}
            <span className={s.core}>
              <svg viewBox="0 0 398 398" width="28" height="28" fill="currentColor">
                <rect width="229" height="229" rx="70" />
                <path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" />
                <circle cx="281" cy="281" r="117" />
              </svg>
            </span>
          </div>
          {enterpriseCopy.boundary.map((b, i) => (
            <span key={b.id} className={s.tag} data-pos={i}>
              <i />
              {b.name}
            </span>
          ))}
        </div>

        <dl className={s.specs}>
          {enterpriseCopy.boundary.map((b) => (
            <div key={b.id} className={s.spec}>
              <dt>{b.name}</dt>
              <dd>{b.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
