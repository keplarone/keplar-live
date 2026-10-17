"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * Space fields: pill inputs and selects, a rounded textarea; a soft inner depth, the violet glow while typing, a red glow when
 * invalid. Styles: .sp-input / .sp-textarea / .sp-select / .sp-field in src/styles/space.css.
 * <Field label hint error> wraps one control and wires label, description and aria-invalid.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { fieldSize?: "sm" | "md" }>(function Input({ className, fieldSize = "md", ...rest }, ref) {
  return <input ref={ref} className={className ? `sp-input ${className}` : "sp-input"} data-size={fieldSize} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={className ? `sp-textarea ${className}` : "sp-textarea"} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { fieldSize?: "sm" | "md" }>(function Select({ className, fieldSize = "md", ...rest }, ref) {
  return <select ref={ref} className={className ? `sp-select ${className}` : "sp-select"} data-size={fieldSize} {...rest} />;
});

/** Label + one control + hint / error. The child gets id, aria-describedby and aria-invalid through the render prop. */
export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode }) {
  const id = useId();
  const desc = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className ? `sp-field ${className}` : "sp-field"}>
      <label className="sp-field__label" htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": desc, "aria-invalid": error ? true : undefined })}
      {hint ? <span id={`${id}-h`} className="sp-field__hint">{hint}</span> : null}
      {error ? <span id={`${id}-e`} className="sp-field__error" role="alert">{error}</span> : null}
    </div>
  );
}
