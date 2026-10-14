import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";
import t from "./tokens.module.css";

export type StudioTheme = "dark" | "light";

export interface StudioRootProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  children?: ReactNode;
  /** Pin this subtree to one theme. Omit to follow the site theme (<html data-theme>, set by src/lib/theme.ts). */
  theme?: StudioTheme;
  /** Paint the canvas colour (--ks-bg) on the root. Full pages want this; the transparent overlay window does not. */
  paint?: boolean;
}

/**
 * The single entry point of the Studio design system: every Studio screen (the overlay and the full-page Workspace) renders inside
 * one. It scopes the --ks-* tokens (tokens.module.css), sets the base type, and gives top-layer UI (Tooltip, Popover, Menu,
 * Toast, Dialog) its tokens, since they are rendered as descendants of this element.
 *
 * Deliberately not a "use client" module (it has no hooks or handlers): server components can render it, and the
 * `srOnly` / `studioRootClass` strings below stay plain strings when imported by server-renderable modules (Badge, Feedback)
 * instead of becoming client references.
 */
export function StudioRoot({ theme, paint, className, children, ...rest }: StudioRootProps) {
  return (
    <div {...rest} data-ks-root="" data-ks-theme={theme} className={cx(t.root, paint && t.paint, className)}>
      {children}
    </div>
  );
}

/** Class name of the token scope, for a host element that cannot be a <StudioRoot> (e.g. a body-level portal container). */
export const studioRootClass: string = t.root;
/** Visually hidden but announced (screen readers). */
export const srOnly: string = t.srOnly;
