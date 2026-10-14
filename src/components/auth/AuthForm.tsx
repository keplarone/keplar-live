"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkPassword, validEmail } from "@/lib/accounts/password-policy";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { postAuth, sendMagicLink } from "./api";
import { Alert, PasswordField, StrengthHint, TextField } from "./fields";
import { PasskeyButton } from "./PasskeyButton";
import { ProviderButtons, setRememberPreference, type OAuthFlags } from "./ProviderButtons";
import { useClientText } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/format";
import s from "./auth.module.css";

type Caps = { passwords: boolean; email: boolean };
type Props = {
  mode: "signin" | "signup";
  providers: OAuthFlags;
  caps: Caps;
  /** Already passed through `authRedirectPath` on the server. */
  next: string;
  devTools: boolean;
  /** Query string to carry `next` to the sibling auth pages ("" or "?next=…"). */
  nextQs: string;
};

type Sent = { kind: "verify" | "link"; email: string } | null;
type Errors = Partial<Record<"email" | "password" | "confirm" | "terms" | "form", string>>;

const RESEND_SECONDS = 30;

export function AuthForm({ mode, providers, caps, next, devTools, nextQs }: Props) {
  const t = useClientText().authForm;
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState<null | "password" | "link" | "resend">(null);
  const [errors, setErrors] = useState<Errors>({});
  const [unverified, setUnverified] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);
  const callback = signup && next === "/account" ? "/app?welcome=1" : next;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const emailTrim = email.trim();
  const check = useMemo(() => (signup ? checkPassword(password, { email: emailTrim, name }) : null), [signup, password, emailTrim, name]);
  const set = (patch: Errors) => setErrors((e) => ({ ...e, ...patch }));
  const clear = (k: keyof Errors) => setErrors((e) => (e[k] || e.form ? { ...e, [k]: undefined, form: undefined } : e));

  function fail(e: Errors, focus?: "email" | "password" | "confirm" | "terms") {
    setErrors(e);
    ({ email: emailRef, password: passwordRef, confirm: confirmRef, terms: termsRef })[focus ?? "email"]?.current?.focus();
  }

  function go(to: string | undefined) {
    window.location.assign(authRedirectPath(to, next));
  }

  async function submitPassword(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setUnverified(false);
    if (!validEmail(emailTrim)) return fail({ email: emailTrim ? t.errEmail : t.errEmailEmpty }, "email");
    if (!password) return fail({ password: t.errPassword }, "password");
    if (signup) {
      if (!check?.ok) return fail({ password: check?.problem ?? t.errWeak }, "password");
      if (confirm !== password) return fail({ confirm: t.errMatch }, "confirm");
      if (!accept) return fail({ terms: t.errTerms }, "terms");
    }
    setErrors({});
    setBusy("password");
    const r = signup
      ? await postAuth("password/sign-up", { email: emailTrim, password, confirm, name: name.trim() || undefined, acceptTerms: true, callbackURL: callback, remember })
      : await postAuth("password/sign-in", { email: emailTrim, password, callbackURL: next, remember });
    if (r.ok) {
      if (signup) {
        setSent({ kind: "verify", email: emailTrim });
        setCooldown(RESEND_SECONDS);
        setBusy(null);
      } else go(r.redirectTo);
      return;
    }
    setBusy(null);
    if (r.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
    if (r.code === "WEAK_PASSWORD") return fail({ password: r.message }, "password");
    if (r.code === "INVALID_EMAIL" || r.code === "EMAIL_DOMAIN") return fail({ email: r.message }, "email");
    if (r.code === "PASSWORD_MISMATCH") return fail({ confirm: r.message }, "confirm");
    if (r.code === "TERMS_REQUIRED") return fail({ terms: r.message }, "terms");
    setErrors({ form: r.message });
  }

  async function emailLink() {
    if (busy) return;
    if (!validEmail(emailTrim)) return fail({ email: emailTrim ? t.errEmail : t.errEmailAbove }, "email");
    if (signup && !accept) return fail({ terms: t.errTerms }, "terms");
    setErrors({});
    setBusy("link");
    const r = await sendMagicLink({ email: emailTrim, ...(signup && name.trim() ? { name: name.trim() } : {}), callbackURL: callback, remember });
    setBusy(null);
    if (!r.ok) {
      if (r.code === "EMAIL_DOMAIN" || r.code === "INVALID_EMAIL") return fail({ email: r.message }, "email");
      return setErrors({ form: r.status === 429 ? t.errTooMany : r.message });
    }
    setSent({ kind: "link", email: emailTrim });
    setCooldown(RESEND_SECONDS);
  }

  async function resend() {
    if (!sent || busy || cooldown > 0) return;
    setBusy("resend");
    const r = sent.kind === "verify" ? await postAuth("password/resend-verification", { email: sent.email, callbackURL: callback, remember }) : await sendMagicLink({ email: sent.email, callbackURL: callback, remember });
    setBusy(null);
    if (!r.ok) return setErrors({ form: r.message });
    setErrors({});
    setCooldown(RESEND_SECONDS);
  }

  if (sent) {
    return (
      <div className={s.sent}>
        <h2 className={s.sentTitle} tabIndex={-1} ref={sentRef}>
          {t.checkEmail}
        </h2>
        <p className={s.lead}>
          {rich(sent.kind === "verify" ? t.sentVerify : t.sentLink, { b: () => <strong>{sent.email}</strong> }, { email: "" })}
        </p>
        <p className={s.fieldNote}>{t.notThere}</p>
        {devTools ? (
          <p className={s.fieldNote}>
            Dev mode: <Link className={s.link} href="/dev/outbox">open the outbox</Link>.
          </p>
        ) : null}
        {errors.form ? <Alert>{errors.form}</Alert> : null}
        <div className={s.row}>
          <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => void resend()} disabled={busy !== null || cooldown > 0}>
            {busy === "resend" ? t.sending : cooldown > 0 ? t.resendIn.replace("{n}", String(cooldown)) : t.resend}
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setSent(null); setErrors({}); }}>
            {t.differentEmail}
          </button>
        </div>
      </div>
    );
  }

  const mailOff = !caps.email;
  const linkLabel = busy === "link" ? t.sending : signup ? t.linkInstead : t.link;
  // Only working providers show (ProviderButtons); with none, there is no "or use your email" and no provider consent line.
  const anyProvider = providers.google || providers.microsoft;
  const passkey = !signup && caps.passwords;
  return (
    <div className={s.formStack}>
      <ProviderButtons providers={providers} next={callback} errorPath={signup ? "/signup" : "/signin"} remember={remember} />
      {passkey ? <PasskeyButton next={next} remember={remember} /> : null}
      {signup && anyProvider ? (
        <p className={s.fieldNote}>
          {rich(t.oauthConsent, { terms: (x) => <Link className={s.link} href="/terms">{x}</Link>, privacy: (x) => <Link className={s.link} href="/privacy">{x}</Link> })}
        </p>
      ) : null}
      {anyProvider || passkey ? <div className={s.divider}>{t.or}</div> : null}

      {!caps.passwords ? (
        <Alert tone="info">Password accounts aren&rsquo;t available on this server yet (no account database is configured). Use an email link{providers.google || providers.microsoft ? " or a provider above" : ""}.</Alert>
      ) : null}
      {signup && caps.passwords && mailOff ? <Alert tone="info">Email delivery isn&rsquo;t configured on this server yet, so verification emails can&rsquo;t be sent and sign-up with a password is switched off.</Alert> : null}

      <form className={s.form} onSubmit={(e) => void submitPassword(e)} noValidate>
        {signup ? <TextField id="name" label={<>{t.name} <span className={s.optional}>{t.optional}</span></>} value={name} onChange={setName} autoComplete="name" autoFocus maxLength={80} /> : null}
        <TextField
          id="email"
          type="email"
          label={t.email}
          value={email}
          onChange={(v) => { setEmail(v); clear("email"); }}
          autoComplete={signup ? "email" : "username"}
          autoFocus={!signup}
          required
          placeholder="you@example.com"
          error={errors.email}
          inputRef={emailRef}
          suggest
        />
        {caps.passwords ? (
          <>
            <PasswordField
              id="password"
              label={t.password}
              value={password}
              onChange={(v) => { setPassword(v); clear("password"); }}
              autoComplete={signup ? "new-password" : "current-password"}
              error={errors.password}
              inputRef={passwordRef}
              aside={signup ? undefined : <Link className={s.link} href={`/forgot-password${nextQs}`}>{t.forgot}</Link>}
              below={signup ? <StrengthHint value={password} context={{ email: emailTrim, name }} /> : undefined}
            />
            {signup ? (
              <PasswordField
                id="confirm"
                label={t.confirm}
                value={confirm}
                onChange={(v) => { setConfirm(v); clear("confirm"); }}
                onBlur={() => { if (confirm && confirm !== password) set({ confirm: t.errMatch }); }}
                autoComplete="new-password"
                error={errors.confirm}
                inputRef={confirmRef}
              />
            ) : null}
          </>
        ) : null}

        {signup ? (
          <div className={s.field}>
            <label className={s.check}>
              <input ref={termsRef} type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); clear("terms"); }} aria-invalid={errors.terms ? true : undefined} aria-describedby={errors.terms ? "terms-d" : undefined} />
              <span>
                {rich(t.terms, { terms: (x) => <Link className={s.link} href="/terms" target="_blank" rel="noopener">{x}</Link>, privacy: (x) => <Link className={s.link} href="/privacy" target="_blank" rel="noopener">{x}</Link> })}
              </span>
            </label>
            <div id="terms-d" aria-live="polite">
              {errors.terms ? <p className={`${s.fieldNote} ${s.err}`} role="alert">{errors.terms}</p> : null}
            </div>
          </div>
        ) : (
          <label className={s.check}>
            <input type="checkbox" checked={remember} onChange={(e) => { setRemember(e.target.checked); setRememberPreference(e.target.checked); }} />
            <span>{t.remember}</span>
          </label>
        )}

        {errors.form ? <Alert>{errors.form}</Alert> : null}
        {unverified ? (
          <Alert tone="info">
            {t.unverified}{" "}
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => {
                setSent({ kind: "verify", email: emailTrim });
                void postAuth("password/resend-verification", { email: emailTrim, callbackURL: next, remember }).then((r) => (r.ok ? setCooldown(RESEND_SECONDS) : setErrors({ form: r.message })));
              }}
              disabled={mailOff}
            >
              {t.resendVerify}
            </button>
          </Alert>
        ) : null}

        {caps.passwords ? (
          <button className={`${s.btn} ${s.btnPrimary}`} type="submit" disabled={busy !== null || (signup && mailOff)} aria-busy={busy === "password" || undefined}>
            {busy === "password" ? (signup ? t.creating : t.loggingIn) : signup ? t.create : t.logIn}
          </button>
        ) : null}
      </form>

      {/* The email link is the primary action when it is the only way in (no password accounts on this server). */}
      <button type="button" className={`${s.btn} ${caps.passwords ? s.btnSecondary : s.btnPrimary}`} onClick={() => void emailLink()} disabled={busy !== null || mailOff} aria-describedby={mailOff ? "mail-off" : undefined}>
        {linkLabel}
      </button>
      {mailOff ? (
        <p id="mail-off" className={s.fieldNote}>
          Email links aren&rsquo;t available yet: email delivery isn&rsquo;t configured on this server.
        </p>
      ) : (
        <p className={s.fieldNote}>{t.noPassword}</p>
      )}
    </div>
  );
}
