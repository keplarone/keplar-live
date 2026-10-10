"use client";
import { useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { postAuth } from "./api";
import s from "./auth.module.css";
import { useClientText } from "@/lib/i18n/client";

const noSubscribe = () => () => undefined;

async function begin(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return res.ok ? ((await res.json()) as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; token: string }) : null;
}

/** "Log in with a passkey". Only shown where the browser supports passkeys; the browser lists the passkeys it has for this site, so no email is needed. */
export function PasskeyButton({ next, remember = true }: { next: string; remember?: boolean }) {
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => false);
  const t = useClientText().authForm;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported) return null;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const o = await begin("passkey/login/options", {});
      if (!o) throw new Error("Passkeys aren't available right now. Use another way to log in.");
      const response = await startAuthentication({ optionsJSON: o.options });
      const r = await postAuth("passkey/login/verify", { token: o.token, response, callbackURL: next, remember });
      if (!r.ok) throw new Error(r.status === 401 ? "We couldn't log you in with that passkey. Try again, or use another way to log in." : r.message);
      window.location.assign(r.redirectTo || next);
      return;
    } catch (e) {
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? "The passkey prompt was closed or timed out. Try again when you're ready." : err.message || "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className={s.providers}>
      <button type="button" className={`${s.btn} ${s.btnSecondary} ${s.providerBtn}`} onClick={() => void go()} disabled={busy} aria-busy={busy || undefined} data-provider="passkey">
        <span>{busy ? t.passkeyWaiting : t.passkey}</span>
      </button>
      {error ? (
        <p className={`${s.fieldNote} ${s.err}`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
