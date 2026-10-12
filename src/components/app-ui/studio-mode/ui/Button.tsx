"use client";

import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { cx } from "./cx";
import { ActivityIndicator } from "./Feedback";
import { Tooltip } from "./Tooltip";
import c from "./controls.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "disabled"> {
  /** primary = monochrome inverse pill (one per surface); secondary = outlined pill; ghost = quiet toolbar; danger = destructive pill */
  variant?: ButtonVariant;
  size?: ControlSize;
  /**
   * A real request is in flight. Shows the geometric activity indicator in the leading slot, sets aria-busy and ignores
   * clicks, but stays focusable so keyboard and screen-reader users keep their place.
   */
  loading?: boolean;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  fullWidth,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      className={cx(c.act, className)}
      data-variant={variant}
      data-size={size}
      data-full={fullWidth ? "" : undefined}
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
      {loading ? (
        <span className={c.actSlot}>
          <ActivityIndicator label="" size={size === "lg" ? 16 : 14} />
        </span>
      ) : leadingIcon ? (
        <span className={c.actSlot}>{leadingIcon}</span>
      ) : null}
      {children != null ? <span className={c.actLabel}>{children}</span> : null}
      {trailingIcon ? <span className={c.actSlot}>{trailingIcon}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "disabled" | "children"> {
  /** Accessible name (required) and tooltip text. */
  label: string;
  /** The icon: <Icon> or <MorphIcon> (decorative; the button carries the name). */
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  size?: ControlSize;
  /** square (toolbar) or circle (e.g. the composer's send). Default: circle for primary, square otherwise. */
  shape?: "square" | "circle";
  /** For toggle buttons: the real on/off state (aria-pressed). */
  pressed?: boolean;
  disabled?: boolean;
  /** Shown in the tooltip. */
  shortcut?: readonly string[];
  /** Default true. Set false when the label is visible elsewhere or a menu from this button is open. */
  tooltip?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  shape,
  pressed,
  disabled = false,
  shortcut,
  tooltip = true,
  tooltipSide = "top",
  className,
  onClick,
  type = "button",
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      {...rest}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={cx(c.glyphAct, className)}
      data-variant={variant}
      data-size={size}
      data-shape={shape ?? (variant === "primary" ? "circle" : "square")}
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
  // Always the same tree (the tooltip is disabled, not removed), so toggling `tooltip` never remounts the button and
  // refs / focus held on it (Menu triggers) survive.
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide} disabled={!tooltip}>
      {button}
    </Tooltip>
  );
}
