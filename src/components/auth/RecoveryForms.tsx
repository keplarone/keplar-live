"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkPassword, validEmail } from "@/lib/accounts/password-policy";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { postAuth } from "./api";
import { Alert, PasswordField, StrengthHint, TextField } from "./fields";
import s from "./auth.module.css";

/** "Forgot password?": one field, one generic answer (it never says whether the address has an account). */
export function ForgotForm({ caps, next, nextQs, devTools }: { caps: { passwords: boolean; email: boolean }; next: string; nextQs: string; devTools: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const unavailable = !caps.passwords || !caps.email;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || cooldown > 0) return;
    const v = email.trim();
    if (!validEmail(v)) {
      setError(v ? "Enter a valid email address, like you@example.com." : "Enter your email address.");
      ref.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    const r = await postAuth("password/forgot", { email: v, callbackURL: next });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setSent(v);
    setCooldown(30);
  }

  if (sent) {
    return (
      <div className={s.sent}>
        <h2 className={s.sentTitle} tabIndex={-1} ref={doneRef}>Check your email</h2>
        <p className={s.lead}>
          If <strong>{sent}</strong> has a Keplar account, we&rsquo;ve sent a link to choose a new password. It expires in 30 minutes and works once.
        </p>
        <p className={s.fieldNote}>Nothing there after a few minutes? Check spam, or try again.</p>
        {devTools ? <p className={s.fieldNote}>Dev mode: <Link className={s.link} href="/dev/outbox">open the outbox</Link>.</p> : null}
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnSecondary}`} disabled={busy || cooldown > 0} onClick={(e) => void submit(e)}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
          </button>
          <Link className={`${s.btn} ${s.btnGhost}`} href={`/signin${nextQs}`}>Back to log in</Link>
        </div>
        {error ? <Alert>{error}</Alert> : null}
      </div>
    );
  }
  return (
    <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
      {!caps.passwords ? <Alert tone="info">Password accounts aren&rsquo;t available on this server yet, so there is nothing to reset. Use an email sign-in link instead.</Alert> : null}
      {caps.passwords && !caps.email ? <Alert tone="info">Email delivery isn&rsquo;t configured on this server yet, so reset emails can&rsquo;t be sent.</Alert> : null}
      <TextField id="email" type="email" label="Email" value={email} onChange={(v) => { setEmail(v); setError(null); }} autoComplete="username" autoFocus required placeholder="you@example.com" error={error} inputRef={ref} suggest />
      <button className={`${s.btn} ${s.btnPrimary}`} type="submit" disabled={busy || unavailable} aria-busy={busy || undefined}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
      <p className={s.fieldNote}>
        Remembered it? <Link className={s.link} href={`/signin${nextQs}`}>Log in</Link>
      </p>
    </form>
  );
}

/** Choose a new password from an emailed link; signs this device in on success. */
export function ResetForm({ token, email, next }: { token: string; email: string; next: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const pw = useRef<HTMLInputElement>(null);
  const cf = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const c = checkPassword(password, { email });
    if (!c.ok) {
      setErrors({ password: c.problem ?? "Choose a stronger password." });
      pw.current?.focus();
      return;
    }
    if (confirm !== password) {
      setErrors({ confirm: "The two passwords don't match." });
      cf.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const r = await postAuth("password/reset", { token, password, confirm });
    if (r.ok) return void window.location.assign(authRedirectPath(r.redirectTo, next));
    setBusy(false);
    if (r.code === "WEAK_PASSWORD") setErrors({ password: r.message });
    else setErrors({ form: r.message });
  }

  return (
    <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
      <p className={s.lead}>Choose a new password for <strong>{email}</strong>. You&rsquo;ll be signed out of other devices.</p>
      <PasswordField id="password" label="New password" value={password} onChange={(v) => { setPassword(v); setErrors((x) => (x.password || x.form ? {} : x)); }} autoComplete="new-password" autoFocus error={errors.password} inputRef={pw} below={<StrengthHint value={password} context={{ email }} />} />
      <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={(v) => { setConfirm(v); setErrors((x) => (x.confirm || x.form ? {} : x)); }} onBlur={() => { if (confirm && confirm !== password) setErrors((x) => ({ ...x, confirm: "The two passwords don't match." })); }} autoComplete="new-password" error={errors.confirm} inputRef={cf} />
      {errors.form ? (
        <Alert>
          {errors.form} <Link className={s.link} href="/forgot-password">Request a new link</Link>.
        </Alert>
      ) : null}
      <button className={`${s.btn} ${s.btnPrimary}`} type="submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? "Saving…" : "Set password and log in"}
      </button>
    </form>
  );
}

/** The explicit click that consumes a verification link (scanners that prefetch the page never click). */
export function VerifyEmailConfirm({ token, email }: { token: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const r = await postAuth("password/verify-email", { token });
    if (r.ok) return void window.location.assign(authRedirectPath(r.redirectTo, "/app?welcome=1"));
    setBusy(false);
    setError(r.message);
  }
  return (
    <div className={s.form}>
      <p className={s.lead}>Confirm <strong>{email}</strong> to finish creating your account. You&rsquo;ll be logged in right after.</p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void go()} disabled={busy} autoFocus aria-busy={busy || undefined}>
        {busy ? "Verifying…" : "Verify and continue"}
      </button>
      {error ? (
        <Alert>
          {error} <Link className={s.link} href="/signup">Sign up again</Link> or <Link className={s.link} href="/signin">log in</Link>.
        </Alert>
      ) : null}
    </div>
  );
}
