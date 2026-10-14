"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "./fields";
import s from "./auth.module.css";

/** Signs out every device for the account named in the emailed link. It never signs anyone in. */
export function SecureAccountConfirm({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/account/secure", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Something went wrong. Try again.");
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setState("idle");
    }
  }
  if (state === "done") {
    return (
      <div className={s.form}>
        <p className={s.lead}>Every device signed in to <strong>{email}</strong> has been signed out.</p>
        <p className={s.lead}>Next: if you use a password, choose a new one. If you only use email links or Google/Microsoft, secure that mailbox or account too, because anyone who controls it can sign in.</p>
        <Link className={`${s.btn} ${s.btnPrimary}`} href="/forgot-password">Reset my password</Link>
        <Link className={`${s.btn} ${s.btnGhost}`} href="/signin">Sign in</Link>
      </div>
    );
  }
  return (
    <div className={s.form}>
      <p className={s.lead}>This signs <strong>{email}</strong> out of every device, including this one. You can sign in again afterwards.</p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void go()} disabled={state === "busy"} autoFocus aria-busy={state === "busy" || undefined}>
        {state === "busy" ? "Signing out…" : "Sign out of all devices"}
      </button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
