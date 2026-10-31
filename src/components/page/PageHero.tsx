import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import s from "./RoutePlaceholder.module.css";
import { TwoTone } from "@/components/page/TwoTone";

type Cta = { href: string; label: string; variant?: "primary" | "secondary" };

type Props = {
  label: string;
  title: string;
  lede: ReactNode;
  /** At most one primary and one secondary action (docs/ui-v2.md "Page hero"); any further entries are not drawn. */
  ctas?: Cta[];
};

/** Top of a marketing page (UI v2): a plain kicker, the H1, a lead, then at most one primary and one secondary CTA. */
export function PageHero({ label, title, lede, ctas }: Props) {
  const primary = ctas?.find((c) => (c.variant ?? "primary") === "primary");
  const secondary = ctas?.find((c) => c.variant === "secondary");
  return (
    <header className={s.hero}>
      <div className={s.header}>
        <p className={s.label} data-o="RoutePlaceholder label">{label}</p>
        <h1 className={s.title} data-o="RoutePlaceholder title"><TwoTone text={title} /></h1>
        <p className={s.lede}>{lede}</p>
        {primary || secondary ? (
          <div className={s.ctaRow}>
            {primary ? (
              <ButtonLink href={primary.href} arrow size="lg" variant="primary">
                {primary.label}
              </ButtonLink>
            ) : null}
            {secondary ? (
              <ButtonLink href={secondary.href} size="lg" variant="secondary">
                {secondary.label}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
