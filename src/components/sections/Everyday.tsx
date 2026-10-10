import { ButtonLink } from "@/components/ui/Button";
import { everydayCopy, useCases } from "@/lib/sections";
import { tryHref } from "@/lib/site";
import { SectionHeader } from "./SectionHeader";
import s from "./Everyday.module.css";

/**
 * Everyday, personal uses as a hairline grid (no icons, no stock imagery).
 * Each cell shows a real example question and any caveat inline.
 */
export function Everyday({ headingLevel = "h2", showCta = true, id = "everyday-title" }: { headingLevel?: "h1" | "h2"; showCta?: boolean; id?: string }) {
  const Sub = headingLevel === "h1" ? "h2" : "h3";
  return (
    <section className={s.section} aria-labelledby={id}>
      <div className={s.inner}>
        <SectionHeader tone="memory" id={id} as={headingLevel} label={everydayCopy.label} title={everydayCopy.title} lede={everydayCopy.lede} align="split" />
        <ul className={s.grid} data-reveal-stagger>
          {useCases.map((u, i) => (
            <li key={u.id} className={s.cell} data-reveal>
              <span className={s.num} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <Sub className={s.name}>{u.name}</Sub>
              <p className={s.text}>{u.text}</p>
              <p className={s.example}>
                <span className={s.exampleLabel}>Ask</span>
                <span>“{u.example}”</span>
              </p>
              {u.caveat ? <p className={s.caveat}>{u.caveat}</p> : null}
            </li>
          ))}
        </ul>
        {showCta ? (
          <div className={s.ctas}>
            <ButtonLink href={tryHref} arrow>
              Ask your first question
            </ButtonLink>
            <ButtonLink href="/for-you" variant="secondary">
              {everydayCopy.cta}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}
