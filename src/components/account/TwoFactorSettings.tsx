"use client";
import { useEffect, useState } from "react";
import { isReauth, ReauthNotice } from "./reauth";
import s from "./account.module.css";

type Status = { enabled: boolean; recoveryLeft: number };

async function api(method: "GET" | "POST", payload?: unknown) {
  const res = await fetch("/api/account/mfa", { method, headers: { "content-type": "application/json" }, credentials: "same-origin", cache: "no-store", body: payload ? JSON.stringify(payload) : undefined });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: res.status, code: j.code });
  return j;
}

const group = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/** Authenticator-app sign-in: optional for everyone, recommended for admins. Hidden when the account database isn't connected. */
export function TwoFactorSettings({ admin }: { admin: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [off, setOff] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);

  useEffect(() => {
    let live = true;
    api("GET").then((j) => live && setStatus(j as unknown as Status)).catch((e: Error & { status?: number }) => live && (e.status === 501 || e.status === 401) && setOff(true));
    return () => { live = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setReauth(false);
    try {
      await fn();
    } catch (e) {
      if (isReauth(e)) setReauth(true);
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  if (off) return null;
  const clear = () => { setCode(""); setMode("idle"); setSetup(null); };
  return (
    <div className={s.panel} id="two-factor" aria-labelledby="mfa-h">
      <div className={s.row}>
        <h2 id="mfa-h" className={s.cardTitle}>Two-factor sign-in</h2>
        <span className={s.v}>{status ? (status.enabled ? "On" : "Off") : "…"}</span>
      </div>
      {codes ? (
        <div className={s.form}>
          <p className={s.note} role="status">Save these recovery codes somewhere safe, like a password manager. Each works once if you lose your authenticator app. <strong>They are shown only now.</strong></p>
          <ul className={s.note} style={{ columns: 2, fontFamily: "ui-monospace, monospace", listStyle: "none", padding: 0 }}>
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Copy codes</button>
            <button type="button" className={s.btn} onClick={() => { setCodes(null); clear(); void api("GET").then((j) => setStatus(j as unknown as Status)); }}>I saved them</button>
          </div>
        </div>
      ) : setup ? (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void run(async () => { const j = await api("POST", { action: "enable", code }); setCodes(j.recoveryCodes as string[]); setSetup(null); setCode(""); }); }}>
          <p className={s.note}>1. In an authenticator app (1Password, Google Authenticator, Authy, and so on), add an account with this key, or open the link on your phone:</p>
          <p className={s.note} style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{group(setup.secret)}</p>
          <p className={s.note}><a className={s.link} href={setup.uri}>Open in authenticator app</a></p>
          <label className={s.fieldLabel} htmlFor="mfa-enable-code">2. Enter the 6-digit code it shows</label>
          <input id="mfa-enable-code" className={s.input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={10} autoFocus />
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : "Turn on"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={clear} disabled={busy}>Cancel</button>
          </div>
        </form>
      ) : status?.enabled ? (
        mode === "idle" ? (
          <>
            <p className={s.note}>Logging in asks for a code from your authenticator app. {status.recoveryLeft} recovery code{status.recoveryLeft === 1 ? "" : "s"} left{status.recoveryLeft <= 2 ? ". Make new ones soon." : "."}</p>
            <div className={s.actions}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setMode("regenerate")}>New recovery codes</button>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setMode("disable")}>Turn off</button>
            </div>
          </>
        ) : (
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); void run(async () => { const j = await api("POST", { action: mode, code }); if (mode === "regenerate") setCodes(j.recoveryCodes as string[]); else setStatus({ enabled: false, recoveryLeft: 0 }); setCode(""); setMode("idle"); }); }}>
            <label className={s.fieldLabel} htmlFor="mfa-confirm-code">{mode === "disable" ? "To turn off, enter a current code or a recovery code" : "To make new recovery codes, enter a current code or a recovery code"}</label>
            <input id="mfa-confirm-code" className={s.input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={20} autoFocus />
            <div className={s.actions}>
              <button type="submit" className={s.btn} disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : mode === "disable" ? "Turn off" : "Make new codes"}</button>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={clear} disabled={busy}>Cancel</button>
            </div>
          </form>
        )
      ) : status ? (
        <>
          <p className={s.note}>Add a second step to signing in: a 6-digit code from an authenticator app. It&rsquo;s optional{admin ? ", but strongly recommended for admin accounts" : ""}. Anyone who can get into your email could otherwise sign in with a link.</p>
          <div className={s.actions}>
            <button type="button" className={s.btn} disabled={busy} onClick={() => void run(async () => setSetup((await api("POST", { action: "setup" })) as unknown as { secret: string; uri: string }))}>Set up</button>
          </div>
        </>
      ) : null}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {reauth ? <ReauthNotice className={`${s.note} ${s.err}`} linkClassName={s.link} /> : null}
    </div>
  );
}
