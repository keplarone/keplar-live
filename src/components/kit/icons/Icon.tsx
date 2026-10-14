import type { SVGProps } from "react";
import { cx } from "../cx";
import { GLYPHS, type IconName } from "./glyphs";
import s from "./icons.module.css";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "name"> {
  name: IconName;
  /** Rendered size in px (square). 16 in dense UI, 20 in headers. Default 16. */
  size?: number;
  /** Accessible name. Omit for a decorative icon next to visible text (it is then hidden from assistive tech). */
  label?: string;
}

/** A static Studio icon. For an icon whose drawing reflects a changing state, use <MorphIcon>. */
export function Icon({ name, size = 16, label, className, ...rest }: IconProps) {
  return (
    <svg
      {...rest}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx(s.icon, className)}
      data-icon={name}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {GLYPHS[name].map((d, i) => (
        <path key={i} className={s.path} d={d} />
      ))}
    </svg>
  );
}
