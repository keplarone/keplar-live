import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import s from "./RoutePlaceholder.module.css";

type Props = {
  label: string;
  title: string;
  lede: string;
  children?: ReactNode;
  cta?: { href: string; label: string };
};

/**
 * Phase 1 route shell: real navigation, real headline copy, quiet layout.
 * Each route is replaced by its full design in phase 2.
 */
export function RoutePlaceholder({ label, title, lede, children, cta }: Props) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <p className={s.label}>{label}</p>
        <h1 className={s.title}>{title}</h1>
        <p className={s.lede}>{lede}</p>
        {cta ? (
          <div className={s.cta}>
            <ButtonLink href={cta.href} arrow size="lg">
              {cta.label}
            </ButtonLink>
          </div>
        ) : null}
      </header>
      {children ? <div className={s.content}>{children}</div> : null}
    </div>
  );
}
