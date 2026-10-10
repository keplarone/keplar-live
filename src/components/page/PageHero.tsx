import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import s from "./RoutePlaceholder.module.css";
import { TwoTone } from "@/components/page/TwoTone";

type Props = {
  label: string;
  title: string;
  lede: ReactNode;
  ctas?: { href: string; label: string; variant?: "primary" | "secondary" }[];
};

/** Top of a marketing page: label, H1, lede, optional CTAs. */
export function PageHero({ label, title, lede, ctas }: Props) {
  return (
    <header className={s.hero}>
      <div className={s.header}>
        <p className={s.label}>{label}</p>
        <h1 className={s.title}><TwoTone text={title} /></h1>
        <p className={s.lede}>{lede}</p>
        {ctas?.length ? (
          <div className={s.ctaRow}>
            {ctas.map((c) => (
              <ButtonLink key={c.href} href={c.href} arrow={c.variant !== "secondary"} size="lg" variant={c.variant ?? "primary"}>
                {c.label}
              </ButtonLink>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
