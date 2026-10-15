"use client";
import { useState } from "react";
import { Alert, TextField } from "@/components/auth/fields";
import { isReauth, ReauthNotice, type CodedError } from "@/components/account/reauth";
import s from "@/components/auth/auth.module.css";

type State = "idle" | "busy" | "opened" | "connected" | "denied" | "error";

/**
 * The explicit "Connect" for the desktop app's or the browser extension's sign-in request (see src/lib/desktop-auth). The person
 * types the short code the app shows: the page never shows it, so a sign-in link someone else started and sent can't be approved
 * by a click alone (the server checks it too).
 */
export function DesktopConnect({ rid, label, connectPath, email, switchHref, appName = "Keplar One", scheme = "keplar:", extension = false }: { rid: string; label: string; /** This page, to come back to after signing in again. */ connectPath: string; email: string; switchHref: string; /** Keplar One or Keplar Business, and its link scheme (src/lib/desktop-auth/core.ts DESKTOP_APPS). */ appName?: string; scheme?: string; /** The browser extension: it collects its connection on its own (no link to open). */ extension?: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const where = extension ? "the extension" : `the ${appName} app`;

  async function post(path: string, extra: Record<string, string> = {}) {
    const res = await fetch(`/api/auth/desktop/${path}`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ rid, ...extra }) });
    const json = (await res.json().catch(() => ({}))) as { deepLink?: string; message?: string; code?: string };
    if (!res.ok) throw Object.assign(new Error(res.status === 429 ? "Too many attempts. Wait a minute and try again." : json.message || "Couldn't connect. Start again from the app."), { status: res.status, code: json.code }) as CodedError;
    return json;
  }

  async function connect() {
    if (typed.replace(/[^A-Za-z0-9]/g, "").length !== 6) {
      setError(`Type the 6-character code shown in ${where}.`);
      setState("error");
      return;
    }
    setState("busy");
    setError(null);
    setReauth(false);
    try {
      const { deepLink } = await post("approve", { code: typed });
      if (extension) { setState("connected"); return; } // the extension is polling with its own verifier and picks this up by itself
      if (!deepLink || !deepLink.startsWith(`${scheme}//auth?`)) throw new Error("Couldn't connect. Start again from the app.");
      setLink(deepLink);
      setState("opened");
      window.location.assign(deepLink);
    } catch (e) {
      if (isReauth(e)) setReauth(true);
      else setError(e instanceof Error ? e.message : "Couldn't connect.");
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

  if (state === "connected") {
    return (
      <div className={s.form} data-testid="desktop-connect-connected">
        <p className={s.lead}>Connected. The extension finishes on its own in a few seconds; you can close this tab.</p>
        <p className={s.lead}>Searches in the extension use this account&apos;s credits, like a question in the app. Disconnect it anytime from the extension or in Account → Developer API.</p>
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
      {extension ? <p className={s.lead}>Its searches will use this account&apos;s credits, like a question in the app. No key to create or paste.</p> : null}
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); void connect(); }} noValidate>
        <TextField
          id="desktop-connect-code"
          label={`Code shown in ${where}`}
          hint={`Only continue if ${where} is open in front of you and you started this sign-in. Never type a code someone sent you.`}
          value={typed}
          onChange={(v) => { setTyped(v.toUpperCase()); if (state === "error") { setState("idle"); setError(null); } }}
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="K7F-2QM"
          maxLength={12}
        />
        <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={state === "busy"} aria-busy={state === "busy" || undefined} data-testid="desktop-connect-approve">
          {state === "busy" ? "Connecting…" : `Connect ${appName}`}
        </button>
      </form>
      <a className={`${s.btn} ${s.btnSecondary}`} href={switchHref}>Use a different account</a>
      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void stop()} disabled={state === "busy"}>This wasn&apos;t me</button>
      <div aria-live="polite">{reauth ? <ReauthNotice next={connectPath} /> : error ? <Alert>{error}</Alert> : null}</div>
    </div>
  );
}
