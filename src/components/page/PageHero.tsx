import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { TrackedLink } from "@/components/growth/TrackedLink";
import s from "./RoutePlaceholder.module.css";
import { TwoTone } from "@/components/page/TwoTone";

type Cta = { href: string; label: string; variant?: "primary" | "secondary" };


type Props = {
  label: string;
  title: string;
  lede: ReactNode;
  /** At most one primary and one secondary action (docs/ui-v2.md "Page hero"); any further entries are not drawn. */
  ctas?: Cta[];
  /** Placement label: when set, the actions are TrackedLinks (funnel click event, campaign tags kept). */
  where?: string;
};

/** Top of a marketing page (UI v2): a plain kicker, the H1, a lead, then at most one primary and one secondary CTA. */
export function PageHero({ label, title, lede, ctas, where }: Props) {
  const action = (c: Cta, placement: string, arrow: boolean) =>
    where ? (
      <TrackedLink href={c.href} where={`${where}:${placement}`} size="lg" variant={c.variant ?? "primary"} arrow={arrow}>{c.label}</TrackedLink>
    ) : (
      <ButtonLink href={c.href} size="lg" variant={c.variant ?? "primary"} arrow={arrow}>{c.label}</ButtonLink>
    );
  const primary = ctas?.find((c) => (c.variant ?? "primary") === "primary");
  const secondary = ctas?.find((c) => c.variant === "secondary");
  return (
    <header className={s.hero}>
      <div className={s.header}>
        <p className={s.label}>{label}</p>
        <h1 className={s.title}><TwoTone text={title} /></h1>
        <p className={s.lede}>{lede}</p>
        {primary || secondary ? (
          <div className={s.ctaRow}>
            {primary ? action(primary, "hero", true) : null}
            {secondary ? action(secondary, "hero-secondary", false) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
