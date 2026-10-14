"use client";

import { useId, type ReactNode } from "react";
import { cx } from "./cx";
import { srOnly } from "./StudioRoot";
import c from "./controls.module.css";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name; shown beside the switch unless `hideLabel`. */
  label: ReactNode;
  hideLabel?: boolean;
  disabled?: boolean;
  /** Optional id of an element that describes the setting. */
  describedBy?: string;
  className?: string;
}

/** On/off setting that takes effect immediately (role="switch"). Space/Enter toggle (native button). */
export function Switch({ checked, onCheckedChange, label, hideLabel, disabled, describedBy, className }: SwitchProps) {
  const id = useId();
  return (
    <span className={cx(c.switchRow, className)} data-disabled={disabled ? "" : undefined}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        disabled={disabled}
        className={c.switch}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className={c.thumb} aria-hidden="true" />
      </button>
      <label htmlFor={id} className={hideLabel ? srOnly : undefined}>
        {label}
      </label>
    </span>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  hideLabel?: boolean;
  /** Mixed state (some of a group selected). Clicking resolves it to checked. */
  indeterminate?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  className?: string;
}

/** A native checkbox (keyboard, forms and assistive tech for free) drawn in the Studio style. */
export function Checkbox({ checked, onCheckedChange, label, hideLabel, indeterminate = false, disabled, name, value, className }: CheckboxProps) {
  return (
    <label className={cx(c.checkRow, className)} data-disabled={disabled ? "" : undefined}>
      <span className={c.checkBox}>
        <input
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
          }}
          type="checkbox"
          className={c.checkInput}
          checked={checked}
          aria-checked={indeterminate ? "mixed" : checked}
          disabled={disabled}
          name={name}
          value={value}
          onChange={(e) => onCheckedChange(e.currentTarget.checked)}
        />
        <svg className={c.checkMark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path data-mark="check" d="M2.5 6.2 L5 8.5 L9.5 3.5" pathLength={1} />
          <path data-mark="dash" d="M3 6 L9 6" pathLength={1} />
        </svg>
      </span>
      <span className={hideLabel ? srOnly : undefined}>{label}</span>
    </label>
  );
}
