"use client";

import Link from "next/link";
import { forwardRef, type ComponentProps, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Space UI buttons (Space Studio's 3D button). One look for every action: a lit face over a hard ledge; hover lifts it 1px,
 * a press sinks it into the ledge. Styles: src/styles/space.css (.sp-btn). Guide: docs/design/space-ui.md.
 *
 *   <Button variant="primary" onClick={save} status={saving ? "loading" : saved ? "success" : "idle"}>Save</Button>
 *   <ButtonLink href="/pricing" variant="secondary" arrow>See plans</ButtonLink>
 *
 * variant: primary (white on black / ink on paper; one per surface) | secondary (glass) | ghost (quiet) | danger.
 * size: sm (36px) | md (44px) | lg (54px). status: loading shows a spinner ring and ignores clicks but stays focusable;
 * success / error swap the label (successLabel / errorLabel) and tint it; error gives one small shake.
 */
export type SpaceButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type SpaceButtonSize = "sm" | "md" | "lg";
export type SpaceButtonStatus = "idle" | "loading" | "success" | "error";

type Visual = {
  variant?: SpaceButtonVariant;
  size?: SpaceButtonSize;
  status?: SpaceButtonStatus;
  /** Label while status is "success" (default "Done"). */
  successLabel?: ReactNode;
  /** Label while status is "error" (default: the normal label). */
  errorLabel?: ReactNode;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Icon after the label. */
  trailingIcon?: ReactNode;
  /** A small arrow after the label that nudges forward on hover. */
  arrow?: boolean;
  /** Icon-only round button; pass `label` for its accessible name. */
  iconOnly?: boolean;
  /** Accessible name, when the visible text alone is ambiguous (required with iconOnly). */
  label?: string;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

/** The data attributes .sp-btn reads (also usable on any element that should look like a Space button). */
export function spaceButtonAttrs({ variant = "secondary", size = "md", status = "idle", fullWidth, iconOnly }: Pick<Visual, "variant" | "size" | "status" | "fullWidth" | "iconOnly">) {
  return {
    "data-sp-btn": "",
    "data-variant": variant,
    "data-size": size,
    "data-status": status === "idle" ? undefined : status,
    "data-full": fullWidth ? "" : undefined,
    "data-icon": iconOnly ? "" : undefined,
  } as const;
}

export const spaceButtonClass = (extra?: string) => (extra ? `sp-btn ${extra}` : "sp-btn");

function Inner({ status = "idle", successLabel = "Done", errorLabel, icon, trailingIcon, arrow, children }: Visual) {
  const text = status === "success" ? successLabel : status === "error" && errorLabel ? errorLabel : children;
  return (
    <>
      {status === "loading" ? <span className="sp-btn__spinner" aria-hidden="true" /> : icon ? <span className="sp-btn__label" aria-hidden="true">{icon}</span> : null}
      {text != null && text !== false ? (
        <span className="sp-btn__label" data-roll={status === "success" || status === "error" ? "" : undefined} key={status === "success" || status === "error" ? status : "label"}>
          {text}
        </span>
      ) : null}
      {trailingIcon ? <span className="sp-btn__label" aria-hidden="true">{trailingIcon}</span> : null}
      {arrow ? (
        <span className="sp-btn__arrow" aria-hidden="true" data-mirror="">
          →
        </span>
      ) : null}
    </>
  );
}

export type SpaceButtonProps = Visual & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export const Button = forwardRef<HTMLButtonElement, SpaceButtonProps>(function Button(
  { variant = "secondary", size = "md", status = "idle", successLabel, errorLabel, icon, trailingIcon, arrow, iconOnly, label, fullWidth, className, children, type = "button", onClick, ...rest },
  ref,
) {
  const busy = status === "loading";
  return (
    <button
      ref={ref}
      type={type}
      className={spaceButtonClass(className)}
      {...spaceButtonAttrs({ variant, size, status, fullWidth, iconOnly })}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest["aria-disabled"] || undefined}
      aria-label={label ?? rest["aria-label"]}
      {...rest}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    >
      <Inner status={status} successLabel={successLabel} errorLabel={errorLabel} icon={icon} trailingIcon={trailingIcon} arrow={arrow}>
        {children}
      </Inner>
    </button>
  );
});

export type SpaceButtonLinkProps = Visual & Omit<ComponentProps<typeof Link>, "className" | "children">;

/** A navigation that looks like a Space button (it stays an <a>, so middle-click, copy link and prefetch work). */
export function ButtonLink({ variant = "primary", size = "md", status = "idle", successLabel, errorLabel, icon, trailingIcon, arrow, iconOnly, label, fullWidth, className, children, ...rest }: SpaceButtonLinkProps) {
  return (
    <Link className={spaceButtonClass(className)} {...spaceButtonAttrs({ variant, size, status, fullWidth, iconOnly })} aria-label={label} {...rest}>
      <Inner status={status} successLabel={successLabel} errorLabel={errorLabel} icon={icon} trailingIcon={trailingIcon} arrow={arrow}>
        {children}
      </Inner>
    </Link>
  );
}
