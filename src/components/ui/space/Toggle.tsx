"use client";

import { useId } from "react";

/**
 * A switch (role="switch") with a label and optional description: the violet gradient track and a springy thumb that squashes
 * while pressed. Styles: .sp-toggle in src/styles/space.css. Omit `label` to render the bare switch (pass aria-label then).
 */
export function Toggle({ checked, onChange, label, description, disabled, ariaLabel, className }: { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string; disabled?: boolean; ariaLabel?: string; className?: string }) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      className="sp-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="sp-toggle__thumb" />
    </button>
  );
  if (!label) return sw;
  return (
    <div className={className ? `sp-toggle-row ${className}` : "sp-toggle-row"}>
      <div className="sp-toggle-row__text">
        <label htmlFor={id} className="sp-toggle-row__label">{label}</label>
        {description ? <span id={`${id}-d`} className="sp-toggle-row__desc">{description}</span> : null}
      </div>
      {sw}
    </div>
  );
}
