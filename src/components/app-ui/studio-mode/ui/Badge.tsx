import type { ReactNode } from "react";
import { cx } from "./cx";
import { srOnly } from "./StudioRoot";
import c from "./controls.module.css";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  /** Always text: colour is never the only signal. */
  children: ReactNode;
  tone?: Tone;
  variant?: "subtle" | "outline";
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  className?: string;
}

export function Badge({ children, tone = "neutral", variant = "subtle", icon, className }: BadgeProps) {
  return (
    <span className={cx(c.badge, className)} data-tone={tone} data-variant={variant}>
      {icon}
      {children}
    </span>
  );
}

export type Status = "idle" | "running" | "success" | "warning" | "error" | "offline";

export interface StatusDotProps {
  status: Status;
  /** What the status means here ("Connected", "Build failed"). Shown unless `hideLabel`; always announced. */
  label: string;
  hideLabel?: boolean;
  className?: string;
}

/**
 * Status by shape and colour and text, never colour alone: idle = ring, running = half-filled ring, success = disc,
 * warning = triangle, error = diamond, offline = ring with a bar.
 */
export function StatusDot({ status, label, hideLabel, className }: StatusDotProps) {
  return (
    <span className={cx(c.status, className)} data-status={status}>
      <svg className={c.statusShape} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
        {SHAPES[status]}
      </svg>
      <span className={hideLabel ? srOnly : undefined}>{label}</span>
    </span>
  );
}

const SHAPES: Record<Status, ReactNode> = {
  idle: <circle cx="4" cy="4" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  running: (
    <>
      <circle cx="4" cy="4" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 0.9 A3.1 3.1 0 0 1 4 7.1 Z" fill="currentColor" />
    </>
  ),
  success: <circle cx="4" cy="4" r="3.6" fill="currentColor" />,
  warning: <path d="M4 0.4 L7.8 7.4 H0.2 Z" fill="currentColor" />,
  error: <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="currentColor" />,
  offline: (
    <>
      <circle cx="4" cy="4" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 4 H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
};
