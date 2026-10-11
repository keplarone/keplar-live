"use client";
import { useState } from "react";
import { Alert } from "@/components/auth/fields";
import s from "@/components/auth/auth.module.css";

type State = "idle" | "busy" | "opened" | "denied" | "error";

/** The explicit "Connect" click for the desktop app's sign-in request (see src/lib/desktop-auth). */
export function DesktopConnect({ rid, code, label, email, switchHref, appName = "Keplar One", scheme = "keplar:" }: { rid: string; code: string; label: string; email: string; switchHref: string; /** Keplar One or Keplar Business, and its link scheme (src/lib/desktop-auth/core.ts DESKTOP_APPS). */ appName?: string; scheme?: string }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function post(path: string) {
    const res = await fetch(`/api/auth/desktop/${path}`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ rid }) });
    const json = (await res.json().catch(() => ({}))) as { deepLink?: string; message?: string };
    if (!res.ok) throw new Error(res.status === 429 ? "Too many attempts. Wait a minute and try again." : json.message || "Couldn't connect. Start again from the app.");
    return json;
  }

  async function connect() {
    setState("busy");
    setError(null);
    try {
      const { deepLink } = await post("approve");
      if (!deepLink || !deepLink.startsWith(`${scheme}//auth?`)) throw new Error("Couldn't connect. Start again from the app.");
      setLink(deepLink);
      setState("opened");
      window.location.assign(deepLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
      setState("error");
    }
  }

  async function stop() {
    setState("busy");
    try {
      await post("deny");
      setState("denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't stop this sign-in.");
      setState("error");
    }
  }

  if (state === "denied") {
    return (
      <div className={s.form}>
        <p className={s.lead}>Stopped. Nothing was connected. You can close this tab.</p>
      </div>
    );
  }

  if (state === "opened") {
    return (
      <div className={s.form} data-testid="desktop-connect-opened">
        <p className={s.lead}>Opening <strong>{label}</strong>… If your browser asks, allow it to open {appName}.</p>
        <p className={s.lead}>The app also picks this up on its own within a few seconds, so you can close this tab once it shows you signed in.</p>
        <a className={`${s.btn} ${s.btnSecondary}`} href={link ?? "#"}>Open {appName} again</a>
      </div>
    );
  }

  return (
    <div className={s.form}>
      <p className={s.lead}>
        Connect <strong>{label}</strong> to <strong>{email}</strong>.
      </p>
      <p className={s.lead} aria-label="Code shown in the app">
        Code: <strong data-testid="desktop-connect-code" style={{ letterSpacing: "0.12em", fontVariantNumeric: "tabular-nums" }}>{code}</strong>
      </p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void connect()} disabled={state === "busy"} autoFocus aria-busy={state === "busy" || undefined} data-testid="desktop-connect-approve">
        {state === "busy" ? "Connecting…" : `Connect ${appName}`}
      </button>
      <a className={`${s.btn} ${s.btnSecondary}`} href={switchHref}>Use a different account</a>
      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void stop()} disabled={state === "busy"}>This wasn&apos;t me</button>
      <div aria-live="polite">{error ? <Alert>{error}</Alert> : null}</div>
    </div>
  );
}
