import type { ReactNode } from "react";
import { cx } from "./cx";
import { progressRatio } from "./feedback-logic";
import f from "./feedback.module.css";
import { srOnly } from "./StudioRoot";

export interface ProgressProps {
  /** Completed units (a real count: files written, steps done). */
  value: number;
  /** Total units. Must be > 0: with no known total there is no determinate progress, so nothing is rendered. */
  max: number;
  /** Accessible name and visible caption, e.g. "Applying changes". */
  label: string;
  /** Show the caption row above the bar. Default true. */
  showLabel?: boolean;
  /** Visible count text; default "3 of 7". Pass false to hide it. */
  valueText?: string | false;
  tone?: "accent" | "success" | "danger";
  className?: string;
}


/**
 * A determinate progress bar for real counts only. It never animates on its own and never guesses: without a positive total
 * it renders nothing (use <ActivityIndicator> for work whose size is unknown).
 */
export function Progress({ value, max, label, showLabel = true, valueText, tone = "accent", className }: ProgressProps) {
  const ratio = progressRatio(value, max);
  if (ratio === null) return null;
  const done = Math.min(max, Math.max(0, Math.round(value)));
  const text = valueText === false ? null : (valueText ?? `${done} of ${max}`);
  return (
    <div className={cx(f.progress, className)} data-tone={tone}>
      {showLabel || text ? (
        <div className={f.progressHead} aria-hidden="true">
          {showLabel ? <span>{label}</span> : <span />}
          {text ? <span className={f.progressValue}>{text}</span> : null}
        </div>
      ) : null}
      <div
        className={f.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={done}
        aria-valuetext={text ?? undefined}
      >
        <div className={f.fill} style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

export interface ActivityIndicatorProps {
  /**
   * What is in flight, e.g. "Building". Announced politely and shown when `showLabel`. Pass "" when the indicator sits
   * inside a control that already says it is busy (Button loading): it is then decorative.
   */
  label: string;
  showLabel?: boolean;
  /** px. Default 14. */
  size?: number;
  className?: string;
}

/**
 * Geometric activity indicator: a short segment tracing a square. For real in-flight work only (mount it while the request
 * runs, unmount when it settles). Reduced motion: a still, half-traced square.
 */
export function ActivityIndicator({ label, showLabel = false, size = 14, className }: ActivityIndicatorProps) {
  const glyph = (
    <svg className={f.activityGlyph} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect className={f.activityTrack} x="3" y="3" width="10" height="10" rx="1" />
      <path className={f.activitySeg} d="M3 3 H13 V13 H3 Z" pathLength={1} />
    </svg>
  );
  if (!label) return <span className={cx(f.activity, className)}>{glyph}</span>;
  return (
    <span className={cx(f.activity, className)} role="status">
      {glyph}
      {showLabel ? <span>{label}</span> : <span className={srOnly}>{label}</span>}
    </span>
  );
}

export interface EmptyStateProps {
  /** A static <Icon> (decorative). */
  icon?: ReactNode;
  /** One short line: what is empty. */
  title: string;
  /** Optional one-line hint (what to do). Keep it to a sentence; no paragraphs. */
  hint?: string;
  /** Optional single action (a Button). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cx(f.empty, className)}>
      {icon ? <div className={f.emptyIcon}>{icon}</div> : null}
      <p className={f.emptyTitle}>{title}</p>
      {hint ? <p className={f.emptyHint}>{hint}</p> : null}
      {action ? <div className={f.emptyAction}>{action}</div> : null}
    </div>
  );
}
