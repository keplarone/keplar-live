import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import type { OrbitIcon } from "@/lib/orbit-fx";
import s from "./Button.module.css";

/**
 * Keplar Orbit controls (docs/design/keplar-orbit.md §5). Server-safe: no hooks, no client JS of their own. The effects come from
 * data attributes read by src/styles/orbit/fx.css and the one delegated runtime in src/lib/orbit-fx.ts (mounted by <OrbitFx />).
 *
 *   <Button variant="primary" loading={busy} success={saved}>Save</Button>
 *   <ButtonLink href="/pricing" variant="secondary">See plans</ButtonLink>
 *   <IconButton label="Copy answer" icon={<IconCopy />} intent="copy" />
 *   <Chip selected={on} onClick={toggle}>Web</Chip>
 */
export type OrbitVariant = "primary" | "secondary" | "ghost" | "danger";
export type OrbitSize = "sm" | "md" | "lg";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const Check = () => (
  <svg className={s.check} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Face({ children, leading, trailing }: { children: ReactNode; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <span className={s.face}>
      <span className={s.label}>
        {leading ? <span className={s.slot}>{leading}</span> : null}
        {children}
        {trailing ? <span className={s.slot}>{trailing}</span> : null}
      </span>
      <span className={s.spin} aria-hidden="true" />
      <Check />
    </span>
  );
}

type Common = {
  variant?: OrbitVariant;
  size?: OrbitSize;
  /** Work in flight: the edge sweeps, the label cross-fades to a spinner, clicks are ignored, focus stays. */
  loading?: boolean;
  /** Finished: the label morphs to a self-drawing check. Clear it after ~1.6s (or use flashSuccess(el) from orbit-fx). */
  success?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  /** Icon micro-motion intent (send, plus, copy, trash, chevron, refresh). Inferred from the label when omitted. */
  intent?: OrbitIcon;
};

export type ButtonProps = Common & Omit<ComponentProps<"button">, "disabled"> & { disabled?: boolean };

export function Button({ variant = "secondary", size = "md", loading = false, success = false, disabled = false, leadingIcon, trailingIcon, fullWidth, intent, className, children, onClick, type = "button", ...rest }: ButtonProps) {
  const inert = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      className={cx(s.btn, className)}
      data-orbit=""
      data-orbit-fx={variant}
      data-orbit-icon={intent}
      data-variant={variant}
      data-size={size}
      data-full={fullWidth ? "" : undefined}
      data-ofx-state={success ? "success" : undefined}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (inert) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      <Face leading={leadingIcon} trailing={trailingIcon}>{children}</Face>
    </button>
  );
}

export type ButtonLinkProps = Omit<Common, "loading" | "success"> & Omit<ComponentProps<typeof Link>, "className"> & { className?: string };

export function ButtonLink({ variant = "primary", size = "md", leadingIcon, trailingIcon, fullWidth, intent, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={cx(s.btn, className)} data-orbit="" data-orbit-fx={variant} data-orbit-icon={intent} data-variant={variant} data-size={size} data-full={fullWidth ? "" : undefined}>
      <Face leading={leadingIcon} trailing={trailingIcon}>{children}</Face>
    </Link>
  );
}

export type IconButtonProps = Omit<ComponentProps<"button">, "disabled" | "children"> & {
  /** Accessible name (required); also the tooltip text through title when no other tooltip wraps it. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  size?: OrbitSize;
  shape?: "square" | "circle";
  pressed?: boolean;
  disabled?: boolean;
  intent?: OrbitIcon;
};

export function IconButton({ label, icon, variant = "ghost", size = "md", shape = "square", pressed, disabled = false, intent, className, onClick, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={cx(s.btn, s.icon, className)}
      data-orbit=""
      data-orbit-fx="icon"
      data-orbit-icon={intent}
      data-variant={variant}
      data-size={size}
      data-shape={shape}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {icon}
    </button>
  );
}

export type ChipProps = Omit<ComponentProps<"button">, "disabled"> & { selected?: boolean; disabled?: boolean; leadingIcon?: ReactNode; size?: OrbitSize };

export function Chip({ selected, disabled = false, leadingIcon, size = "md", className, children, onClick, type = "button", ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      className={cx(s.btn, s.chip, className)}
      data-orbit=""
      data-orbit-fx="chip"
      data-size={size}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {leadingIcon ? <span className={s.slot}>{leadingIcon}</span> : null}
      {children}
    </button>
  );
}

export { flashSuccess, SUCCESS_MS } from "@/lib/orbit-fx";
