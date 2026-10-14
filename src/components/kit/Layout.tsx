"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { useSlidingIndicator } from "./indicator";
import l from "./layout.module.css";

/* ─────────────────────────────── SegmentedControl ─────────────────────────────── */

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when `label` is not plain text (e.g. icon-only). */
  ariaLabel?: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name of the group, e.g. "Target app". */
  label: string;
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SegmentOption<V>>;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

/**
 * A single choice between 2-5 options (radiogroup). The thumb slides to the selection and retargets mid-flight.
 * Keyboard: Tab focuses the selected option; arrows move and select (wrapping); Home/End.
 */
export function SegmentedControl<V extends string>({ label, value, onValueChange, options, size = "md", fullWidth, className }: SegmentedControlProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(listRef, thumbRef, '[aria-checked="true"]', value);
  const enabled = options.filter((o) => !o.disabled);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next === null || !enabled.length) return;
    e.preventDefault();
    const opt = enabled[(next + enabled.length) % enabled.length];
    onValueChange(opt.value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(opt.value)}"]`)?.focus();
  };
  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={label}
      className={cx(l.seg, className)}
      data-size={size}
      data-full={fullWidth ? "" : undefined}
      onKeyDown={onKey}
    >
      <span ref={thumbRef} className={l.segThumb} aria-hidden="true" />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            className={l.segOption}
            onClick={() => {
              if (!o.disabled && !on) onValueChange(o.value);
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── Tabs ─────────────────────────────── */

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** A real count (e.g. changed files). Omit when unknown; never a placeholder. */
  count?: number;
  disabled?: boolean;
}

/** The Studio inspector's tabs, in order. */
export const INSPECTOR_TABS = ["code", "viewport", "changes", "plan", "activity"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
export const INSPECTOR_TAB_LABELS: Record<InspectorTab, string> = {
  code: "Code",
  viewport: "Viewport",
  changes: "Changes",
  plan: "Plan",
  activity: "Activity",
};

export interface TabsProps<V extends string> {
  /** Stable id prefix linking tabs and panels (`${id}-tab-${value}`, `${id}-panel-${value}`). */
  id: string;
  label: string;
  value: V;
  onValueChange: (value: V) => void;
  items: ReadonlyArray<TabItem<V>>;
  className?: string;
}

export const tabId = (id: string, value: string) => `${id}-tab-${value}`;
export const tabPanelId = (id: string, value: string) => `${id}-panel-${value}`;

/**
 * Tab list (automatic activation): Left/Right move and select, Home/End. The underline slides between tabs.
 * Pair each tab with a <TabPanel id={same id} value=...>.
 */
export function Tabs<V extends string>({ id, label, value, onValueChange, items, className }: TabsProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(listRef, lineRef, '[aria-selected="true"]', value);
  const enabled = items.filter((t) => !t.disabled);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((t) => t.value === value);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next === null || !enabled.length) return;
    e.preventDefault();
    const t = enabled[(next + enabled.length) % enabled.length];
    onValueChange(t.value);
    document.getElementById(tabId(id, t.value))?.focus();
  };
  return (
    <div ref={listRef} role="tablist" aria-label={label} className={cx(l.strip, className)} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            id={tabId(id, t.value)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={tabPanelId(id, t.value)}
            aria-disabled={t.disabled || undefined}
            tabIndex={on ? 0 : -1}
            className={l.stripItem}
            onClick={() => {
              if (!t.disabled) onValueChange(t.value);
            }}
          >
            {t.icon}
            {t.label}
            {typeof t.count === "number" ? <span className={l.stripCount}>{t.count}</span> : null}
          </button>
        );
      })}
      <span ref={lineRef} className={l.stripLine} aria-hidden="true" />
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  value: string;
  /** Whether this panel's tab is selected. Inactive panels stay mounted but hidden (keeps editor state) unless `lazy`. */
  active: boolean;
  /** Unmount while inactive. */
  lazy?: boolean;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ id, value, active, lazy, className, children }: TabPanelProps) {
  if (lazy && !active) return null;
  return (
    <div
      id={tabPanelId(id, value)}
      role="tabpanel"
      aria-labelledby={tabId(id, value)}
      hidden={!active}
      tabIndex={0}
      className={cx(l.viewPane, className)}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────── Panel ─────────────────────────────── */

export interface PanelProps {
  children: ReactNode;
  /** "surface" (default) or "inset" (code / editor background). */
  tone?: "surface" | "inset";
  /** No border or radius (a panel that fills a split pane). */
  flush?: boolean;
  /** Landmark name; when given the panel is a labelled region. */
  label?: string;
  className?: string;
}

export function Panel({ children, tone = "surface", flush, label, className }: PanelProps) {
  return (
    <section className={cx(l.panel, className)} data-tone={tone} data-flush={flush ? "" : undefined} aria-label={label}>
      {children}
    </section>
  );
}

export interface PanelHeaderProps {
  title: ReactNode;
  /** One short line of context next to the title (e.g. a file path). */
  subtitle?: ReactNode;
  /** Trailing controls (IconButtons, a Menu). */
  actions?: ReactNode;
  /** Leading element (an Icon or StatusDot). */
  leading?: ReactNode;
  /** Heading level for the title. Default 2. */
  level?: 2 | 3 | 4;
  className?: string;
}

export function PanelHeader({ title, subtitle, actions, leading, level = 2, className }: PanelHeaderProps) {
  const H = `h${level}` as "h2" | "h3" | "h4";
  return (
    <header className={cx(l.panelHead, className)}>
      {leading}
      <div className={l.panelTitles}>
        <H className={l.panelTitle}>{title}</H>
        {subtitle ? <span className={l.panelSub}>{subtitle}</span> : null}
      </div>
      {actions ? <div className={l.panelActions}>{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ children, padded, className }: { children: ReactNode; padded?: boolean; className?: string }) {
  return (
    <div className={cx(l.panelBody, className)} data-pad={padded ? "" : undefined}>
      {children}
    </div>
  );
}
