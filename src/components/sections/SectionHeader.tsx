import type { ReactNode } from "react";
import s from "./sections.module.css";

type Props = {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  as?: "h1" | "h2";
  align?: "left" | "split";
  size?: "headline" | "display";
  /** What the section is about, as a colour (see the semantic palette). */
  tone?: "reasoning" | "research" | "creation" | "memory" | "attention" | "verified" | "disagree" | "ink";
};

/** Label + headline + lede. `split` puts the lede in a right column on desktop. */
export function SectionHeader({ label, title, lede, id, as = "h2", align = "left", size = "headline", tone = "ink" }: Props) {
  const H = as;
  return (
    <header className={s.header} data-align={align} data-tone={tone}>
      <div>
        <p className={s.label}>{label}</p>
        <H id={id} className={size === "display" ? s.display : s.headline}>
          {title}
        </H>
      </div>
      {lede ? <p className={s.lede}>{lede}</p> : null}
    </header>
  );
}
