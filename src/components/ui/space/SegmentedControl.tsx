"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is an icon. */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Segmented control (Space Studio's .seg): a glass track and a 3D thumb that springs to the chosen option, motion-blurred
 * while it travels. A radiogroup: arrows move and select, Home/End jump. `role="tablist"` mode for view switchers (pass idPrefix
 * so each tab controls `${idPrefix}-panel-${value}`). Styles: .sp-seg in src/styles/space.css.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  mode = "radio",
  idPrefix,
  size = "md",
  fullWidth,
  className,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  mode?: "radio" | "tabs";
  idPrefix?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const last = useRef(value);

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [value, segments]);

  // The thumb motion-blurs while it travels to a new option (not on first paint or a resize).
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    setMoving(true);
    const t = window.setTimeout(() => setMoving(false), 520);
    return () => window.clearTimeout(t);
  }, [value]);

  const pick = (i: number) => {
    const s = segments[i];
    if (!s || s.disabled) return;
    onChange(s.value);
    ref.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(s.value)}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = segments.findIndex((s) => s.value === value);
    const n = segments.length;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") pick((i + 1) % n);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") pick((i - 1 + n) % n);
    else if (e.key === "Home") pick(0);
    else if (e.key === "End") pick(n - 1);
    else return;
    e.preventDefault();
  };

  const tabs = mode === "tabs";
  return (
    <div
      ref={ref}
      className={className ? `sp-seg ${className}` : "sp-seg"}
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      data-size={size}
      data-full={fullWidth ? "" : undefined}
      data-ready={ind ? "" : undefined}
      onKeyDown={onKey}
    >
      {ind ? <span className="sp-seg__ind" data-moving={moving || undefined} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden="true" /> : null}
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            role={tabs ? "tab" : "radio"}
            id={idPrefix ? `${idPrefix}-tab-${s.value}` : undefined}
            aria-controls={tabs && idPrefix ? `${idPrefix}-panel-${s.value}` : undefined}
            aria-checked={tabs ? undefined : on}
            aria-selected={tabs ? on : undefined}
            aria-label={s.ariaLabel}
            tabIndex={on ? 0 : -1}
            disabled={s.disabled}
            data-value={s.value}
            className="sp-seg__opt"
            onClick={() => onChange(s.value)}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
