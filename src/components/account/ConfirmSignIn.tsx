"use client";
import Link from "next/link";
import { useState } from "react";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { Alert } from "@/components/auth/fields";
import s from "@/components/auth/auth.module.css";

/** The explicit click that consumes a magic link (link prefetchers never click). */
export function ConfirmSignIn({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/auth/magic-link/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as { redirectTo?: string; message?: string };
      if (!res.ok) throw new Error(res.status === 429 ? "Too many attempts. Wait a minute and try again." : json.message || "Couldn't sign you in.");
      window.location.replace(authRedirectPath(json.redirectTo, "/account"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign you in.");
      setState("error");
    }
  }

  return (
    <div className={s.form}>
      <p className={s.lead}>Continue as <strong>{email}</strong>.</p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void confirm()} disabled={state === "busy"} autoFocus aria-busy={state === "busy" || undefined}>
        {state === "busy" ? "Signing in…" : "Sign in"}
      </button>
      <div aria-live="polite">
        {error ? (
          <Alert>
            {error} <Link className={s.link} href="/signin">Request a new link</Link>.
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
