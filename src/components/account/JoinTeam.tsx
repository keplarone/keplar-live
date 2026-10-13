"use client";

/**
 * The page an invite email links to. The one-time token is in the URL fragment (never sent to a server by the browser itself), so this page
 * reads it, shows who is asking, and only joins when the person presses the button while signed in with the invited address.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { businessUrl } from "@/lib/business-site";
import s from "./account.module.css";

const KEY = "keplar:team-join";
type Preview = { teamName: string; role: string };

export function JoinTeam() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [business, setBusiness] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "signin" | "invalid" | "joined" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const hash = window.location.hash.replace(/^#/, "");
    const t = hash || sessionStorage.getItem(KEY) || "";
    if (hash) {
      sessionStorage.setItem(KEY, hash);
      history.replaceState(null, "", window.location.pathname); // the token leaves the address bar and history; it stays in this tab's session storage until used
    }
    void (async () => {
      if (!t) { if (live) setState("invalid"); return; }
      const r = await fetch("/api/team/join", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token: t, action: "preview" }) });
      if (!live) return;
      if (!r.ok) { setState("invalid"); return; }
      setToken(t);
      setPreview((await r.json()) as Preview);
      const me = await fetch("/api/team", { cache: "no-store", credentials: "same-origin" });
      if (live) setState(me.status === 401 ? "signin" : "ready");
    })();
    return () => { live = false; };
  }, []);

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/team/join", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token, action: "accept" }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; business?: boolean };
      if (!r.ok) { setMsg(j.error ?? "Couldn't join the team."); setState("error"); return; }
      sessionStorage.removeItem(KEY);
      setBusiness(Boolean(j.business));
      setState("joined");
    } finally { setBusy(false); }
  };

  if (state === "loading") return <p className={s.note} role="status">Checking your invitation…</p>;
  if (state === "invalid") return <p className={`${s.note} ${s.err}`} role="alert">This invite link is not valid any more. It may have been used, revoked or expired. Ask the person who invited you for a new one.</p>;
  if (state === "joined") return (
    <div role="status">
      <p className={`${s.note} ${s.ok}`}>You joined {preview?.teamName}. You&apos;re now working in the team&apos;s shared workspace; switch back to your personal one any time from the account menu.</p>
      {business ? <p className={s.note}>It&apos;s a Keplar Business team: open the Business workspace to work with them on agents, approvals, research and builds.</p> : null}
      <div className={s.actions}>
        {business ? <a className={`${s.btn} ${s.btnSm}`} href={businessUrl("/signin?next=%2Fwork")}>Open Keplar Business</a> : null}
        <Link className={`${s.btn} ${business ? s.btnGhost : ""} ${s.btnSm}`} href="/app">Open Keplar</Link>
      </div>
    </div>
  );
  return (
    <div data-join-team="">
      <p className={s.lead}><strong>{preview?.teamName}</strong> invited you to join as <strong>{preview?.role}</strong>.</p>
      <p className={s.note}>Joining gives you access to the team&apos;s shared projects, chats and sites, never to your personal ones, and the team&apos;s owner and admins can see that you are a member. You can leave at any time. Team workspaces are in beta.</p>
      {state === "signin" ? (
        <div className={s.actions}>
          <a className={`${s.btn} ${s.btnSm}`} href={`/signin?next=${encodeURIComponent("/team/join")}`}>Sign in to join</a>
          <a className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href={`/signup?next=${encodeURIComponent("/team/join")}`}>Create an account</a>
        </div>
      ) : (
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void accept()}>{busy ? "Joining…" : "Join the team"}</button>
        </div>
      )}
      {state === "signin" ? <p className={s.note}>Sign in with the email address the invitation was sent to.</p> : null}
      {msg ? <p className={`${s.note} ${s.err}`} role="alert">{msg}</p> : null}
    </div>
  );
}
