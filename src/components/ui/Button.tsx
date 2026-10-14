import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Magnetic } from "./Magnetic";
import { KLoader } from "@/components/loader/KLoader";
import { CtaLabel } from "./CtaLabel";
import { isTryCta, plainText } from "@/lib/signed-hint";
import s from "./Button.module.css";

type Variant = "primary" | "secondary" | "quiet";
type Size = "sm" | "md" | "lg";

type Common = {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  magnetic?: boolean;
  /** real work in flight: a band of light travels across the pill and a small Keplar loader leads the label (never disables focus) */
  loading?: boolean;
  /** "done" plays one small pop after the work finished */
  state?: "done";
  children: ReactNode;
  className?: string;
};

function classes(variant: Variant, size: Size, extra?: string) {
  return [s.button, s[variant], size !== "md" ? s[size] : "", extra ?? ""].filter(Boolean).join(" ");
}

function Inner({ children, arrow }: { children: ReactNode; arrow?: boolean }) {
  return (
    <>
      <span data-fit="">{isTryCta(plainText(children)) ? <CtaLabel tryText={plainText(children)!.trim()} /> : children}</span>
      {arrow ? (
        <span className={s.arrow} aria-hidden="true" data-mirror="">
          →
        </span>
      ) : null}
    </>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  arrow,
  magnetic = false,
  children,
  className,
  ...rest
}: Common & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  const el = (
    <Link href={href} className={classes(variant, size, className)} data-lit={variant === "quiet" ? undefined : variant === "primary" ? "on-ink" : ""} {...rest}>
      <Inner arrow={arrow}>{children}</Inner>
    </Link>
  );
  return magnetic ? <Magnetic>{el}</Magnetic> : el;
}

export function Button({
  variant = "primary",
  size = "md",
  arrow,
  magnetic = false,
  loading,
  state,
  children,
  className,
  ...rest
}: Common & Omit<ComponentProps<"button">, "className" | "children">) {
  const el = (
    <button type="button" className={classes(variant, size, className)} data-lit={variant === "quiet" ? undefined : variant === "primary" ? "on-ink" : ""} aria-busy={loading || undefined} data-state={state} {...rest}>
      {loading ? <KLoader size={size === "sm" ? 14 : 16} label="Working" tone="current" /> : null}
      <Inner arrow={arrow}>{children}</Inner>
    </button>
  );
  return magnetic ? <Magnetic>{el}</Magnetic> : el;
}
