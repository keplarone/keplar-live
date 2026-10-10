"use client";
import { useId, useState, type ReactNode, type Ref } from "react";
import { suggestEmail } from "@/lib/accounts/email-typos";
import { checkPassword, type PasswordCheck } from "@/lib/accounts/password-policy";
import s from "./auth.module.css";

type FieldShell = { id: string; label: ReactNode; error?: string | null; hint?: ReactNode; aside?: ReactNode };

export function Field({ id, label, error, hint, aside, children }: FieldShell & { children: (p: { "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode }) {
  const descId = `${id}-d`;
  const has = Boolean(error || hint);
  return (
    <div className={s.field}>
      <div className={s.labelRow}>
        <label className={s.label} htmlFor={id}>
          {label}
        </label>
        {aside}
      </div>
      {children({ "aria-describedby": has ? descId : undefined, "aria-invalid": error ? true : undefined })}
      <div id={descId} aria-live="polite">
        {error ? (
          <p className={`${s.fieldNote} ${s.err}`} role="alert">
            {error}
          </p>
        ) : hint ? (
          <p className={s.fieldNote}>{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Text input. `suggest` turns on the "Did you mean ...?" typo hint for email addresses: evaluated when the field loses
 * focus, hidden again the moment the value changes. (type="text" + inputMode="email" on purpose: a type="email" input has
 * no caret API in browsers, which breaks Insert/overtype mode and caret handling; we validate ourselves.)
 */
export function TextField(p: FieldShell & { type?: "text" | "email"; value: string; onChange: (v: string) => void; onBlur?: () => void; autoComplete: string; autoFocus?: boolean; required?: boolean; placeholder?: string; maxLength?: number; inputRef?: Ref<HTMLInputElement>; name?: string; suggest?: boolean }) {
  const [checked, setChecked] = useState<string | null>(null);
  const tip = p.suggest && checked !== null && checked === p.value.trim() ? suggestEmail(p.value) : null;
  return (
    <Field id={p.id} label={p.label} error={p.error} hint={p.hint} aside={p.aside}>
      {(a) => (
        <>
          <input
            {...a}
            ref={p.inputRef}
            id={p.id}
            name={p.name ?? p.id}
            className={s.input}
            type="text"
            value={p.value}
            onChange={(e) => {
              p.onChange(e.target.value);
              if (checked !== null) setChecked(null);
            }}
            onBlur={() => {
              if (p.suggest) setChecked(p.value.trim());
              p.onBlur?.();
            }}
            autoComplete={p.autoComplete}
            autoFocus={p.autoFocus}
            required={p.required}
            placeholder={p.placeholder}
            maxLength={p.maxLength}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode={p.type === "email" ? "email" : undefined}
          />
          {tip ? (
            <p className={s.fieldNote} role="status">
              Did you mean <strong>{tip}</strong>?{" "}
              <button type="button" className={s.linkBtn} onClick={() => { p.onChange(tip); setChecked(null); }}>
                Use it
              </button>
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
}

export function PasswordField(p: FieldShell & { value: string; onChange: (v: string) => void; onBlur?: () => void; autoComplete: "current-password" | "new-password"; autoFocus?: boolean; inputRef?: Ref<HTMLInputElement>; name?: string; below?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <Field id={p.id} label={p.label} error={p.error} hint={p.hint} aside={p.aside}>
      {(a) => (
        <>
          <div className={s.pwWrap}>
            <input
              {...a}
              ref={p.inputRef}
              id={p.id}
              name={p.name ?? p.id}
              className={`${s.input} ${s.pwInput}`}
              type={show ? "text" : "password"}
              value={p.value}
              onChange={(e) => p.onChange(e.target.value)}
              onBlur={p.onBlur}
              autoComplete={p.autoComplete}
              autoFocus={p.autoFocus}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={256}
            />
            <button type="button" className={s.pwToggle} onClick={() => setShow((v) => !v)} aria-pressed={show} aria-controls={p.id}>
              {show ? "Hide" : "Show"}
              <span className={s.srOnly}> password</span>
            </button>
          </div>
          {p.below}
        </>
      )}
    </Field>
  );
}

/** Four-step strength bar + one plain sentence. Pure view of `checkPassword`; announces politely, not on every key. */
export function StrengthHint({ value, context }: { value: string; context: { email?: string; name?: string } }) {
  const id = useId();
  const c: PasswordCheck = checkPassword(value, context);
  const filled = value ? c.score + 1 : 0;
  return (
    <div className={s.strength} data-ok={value ? String(c.ok) : undefined}>
      <div className={s.strengthBar} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} data-on={i < filled || undefined} data-level={c.score} />
        ))}
      </div>
      <p id={id} className={s.fieldNote} aria-live="polite">
        {value ? (
          <>
            <strong className={s.strengthLabel}>{c.label}.</strong> {c.hint}
          </>
        ) : (
          "Use at least 10 characters. A few unrelated words works well."
        )}
      </p>
    </div>
  );
}

export function Alert({ children, tone = "err" }: { children: ReactNode; tone?: "err" | "ok" | "info" }) {
  return (
    <div className={`${s.alert} ${tone === "err" ? s.alertErr : tone === "ok" ? s.alertOk : ""}`} role={tone === "err" ? "alert" : "status"}>
      {children}
    </div>
  );
}
