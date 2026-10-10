"use client";
import { useState } from "react";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { Alert, TextField } from "./fields";
import s from "./auth.module.css";

/** Asks for the authenticator code (or a recovery code) after the first step of sign-in. */
export function TwoFactorForm({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryLeft, setRecoveryLeft] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mfa", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "challenge", code }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string; via?: string; recoveryLeft?: number };
      if (!res.ok) {
        if (j.code === "unauthenticated" || j.code === "session_ended") return void window.location.assign("/signin");
        throw new Error(j.error || "Something went wrong. Try again.");
      }
      if (j.via === "recovery" && typeof j.recoveryLeft === "number") {
        setRecoveryLeft(j.recoveryLeft);
        setBusy(false);
        return;
      }
      window.location.assign(authRedirectPath(next, "/account"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (recoveryLeft !== null) {
    return (
      <div className={s.form}>
        <p className={s.lead}>You&rsquo;re in with a recovery code. You have {recoveryLeft} left. Add a new authenticator or make new codes from Account &gt; Security soon.</p>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => window.location.assign(authRedirectPath(next, "/account"))} autoFocus>Continue</button>
      </div>
    );
  }
  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <TextField id="mfa-code" label="Code" value={code} onChange={setCode} autoComplete="one-time-code" autoFocus placeholder="123456" maxLength={20} />
      <p className={s.lead}>Open your authenticator app and enter the 6-digit code for Keplar. Lost your phone? Enter one of your recovery codes instead.</p>
      <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={busy || code.trim().length < 6} aria-busy={busy || undefined}>{busy ? "Checking…" : "Continue"}</button>
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
