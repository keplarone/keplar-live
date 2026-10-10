import { ButtonLink } from "@/components/ui/Button";
import { pathsCopy } from "@/lib/sections";
import { SectionHeader } from "./SectionHeader";
import s from "./Paths.module.css";

/** "For you / For business": two paths, personal first; Business framed as optional. */
export function Paths() {
  const cards = [
    { key: "personal", ...pathsCopy.personal, note: undefined as string | undefined },
    { key: "business", ...pathsCopy.business },
  ];
  return (
    <section className={s.section} aria-labelledby="paths-title">
      <div className={s.inner}>
        <SectionHeader tone="research" id="paths-title" label={pathsCopy.label} title={pathsCopy.title} lede={pathsCopy.lede} align="split" />
        <div className={s.cards}>
          {cards.map((c) => (
            <article key={c.key} className={s.card} data-path={c.key} aria-labelledby={`path-${c.key}`}>
              <p className={s.cardLabel}>{c.label}</p>
              <h3 id={`path-${c.key}`} className={s.cardTitle}>
                {c.title}
              </h3>
              <ul className={s.points}>
                {c.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {c.note ? <p className={s.note}>{c.note}</p> : null}
              <div className={s.ctas}>
                <ButtonLink href={c.primary.href} arrow variant={c.key === "personal" ? "primary" : "secondary"} magnetic={false}>
                  {c.primary.label}
                </ButtonLink>
                <ButtonLink href={c.secondary.href} variant="quiet" magnetic={false}>
                  {c.secondary.label}
                </ButtonLink>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
