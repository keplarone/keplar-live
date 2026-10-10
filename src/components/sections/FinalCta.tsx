import { ButtonLink } from "@/components/ui/Button";
import { finalCtaCopy } from "@/lib/sections";
import { brand, tryHref } from "@/lib/site";
import { ConvergeCanvas } from "./ConvergeCanvas";
import s from "./FinalCta.module.css";

/** Closes the hero narrative: streams converge into the mark, then the question back to the reader. */
export function FinalCta() {
  return (
    <section className={s.section} aria-labelledby="final-cta-title">
      <ConvergeCanvas className={s.canvas} />
      <h2 id="final-cta-title" className={s.title}>
        {finalCtaCopy.title}
      </h2>
      <div className={s.ctas}>
        <ButtonLink href={tryHref} size="lg" arrow>
          {finalCtaCopy.primary}
        </ButtonLink>
        <ButtonLink href={brand.contactPath} size="lg" variant="secondary" arrow>
          {finalCtaCopy.secondary}
        </ButtonLink>
      </div>
    </section>
  );
}
