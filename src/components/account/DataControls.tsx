"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TRAINING_STATEMENT } from "@/lib/privacy/training-statement";
import { isReauth, ReauthNotice, startExport } from "./reauth";
import s from "./account.module.css";

/** Download everything Keplar holds for the account, or permanently delete it. Delete needs the email typed back. */
export function DataControls({ email, admin }: { email: string; admin: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);

  const [scheduled, setScheduled] = useState<string | null>(null);
  const [grace, setGrace] = useState(14);
  useEffect(() => {
    let live = true;
    fetch("/api/account/delete", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { scheduledFor?: string | null; graceDays?: number } | null) => { if (live && j) { setScheduled(j.scheduledFor ?? null); if (typeof j.graceDays === "number") setGrace(j.graceDays); } })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string; scheduledFor?: string | null };
    if (!res.ok) throw Object.assign(new Error(j.error || "Couldn't update the account."), { status: res.status, code: j.code });
    return j;
  }

  /** Export needs a recent sign-in: ask first (no download yet), then let the browser stream the file. */
  async function download() {
    setError(null);
    setReauth(false);
    try {
      await startExport();
    } catch (e) {
      if (isReauth(e)) setReauth(true);
      else setError(e instanceof Error ? e.message : "Couldn't start the download.");
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await post({ action: "cancel" });
      setScheduled(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel the deletion.");
    }
    setBusy(false);
  }

  async function remove(now: boolean) {
    setBusy(true);
    setError(null);
    setReauth(false);
    try {
      const j = await post({ confirmEmail: typed, now });
      if (j.scheduledFor) {
        setScheduled(j.scheduledFor);
        setConfirming(false);
        setTyped("");
        setBusy(false);
        return;
      }
      window.location.assign("/?account=deleted");
    } catch (e) {
      if (isReauth(e)) setReauth(true);
      else setError(e instanceof Error ? e.message : "Couldn't delete the account.");
      setBusy(false);
    }
  }

  return (
    <div className={s.panel} id="data" aria-labelledby="data-h">
      <div className={s.row}>
        <h2 id="data-h" className={s.cardTitle}>Your data</h2>
      </div>
      <p className={s.note}>Download a copy of what Keplar holds for you: chats, memory, sites, decks, study sets, business data and billing records (connector secrets are left out; images are listed, download the files from Create).</p>
      <h3 className={s.k} style={{ margin: 0, fontSize: "var(--t-small)" }}>How your questions are used</h3>
      {TRAINING_STATEMENT.map((t) => <p key={t} className={s.note}>{t}</p>)}
      <p className={s.note}>Details: <Link href="/privacy#model-providers">Privacy Policy</Link>.</p>
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void download()} disabled={busy}>Download my data</button>
      </div>
      {admin ? (
        <p className={s.note}>Admin accounts can&rsquo;t be deleted here. Contact team@keplar.one.</p>
      ) : scheduled && !confirming ? (
        <div className={s.form}>
          <p className={s.note} role="status">Your account is scheduled to be permanently deleted on <strong>{new Date(scheduled).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>. Nothing has been removed yet. We emailed you the details.</p>
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={() => void cancel()} disabled={busy}>{busy ? "Working…" : "Cancel deletion"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirming(true)} disabled={busy}>Delete now instead</button>
          </div>
        </div>
      ) : !confirming ? (
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirming(true)}>Delete my account</button>
        </div>
      ) : (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void remove(Boolean(scheduled)); }}>
          <p className={s.note}>
            {scheduled ? "This deletes everything right now, without waiting for the scheduled date." : grace > 0 ? `Deletion is scheduled for ${grace} days from now, and you can cancel any time before then.` : "Deletion happens immediately."} It removes your chats, memory, sites, images, decks, study sets, business data and sign-in, and once it happens it can&rsquo;t be undone. Payment records and usage counters are kept as the privacy policy describes. If you pay for a plan, cancel it in Manage billing first. Download your data first if you want a copy.
          </p>
          <label className={s.fieldLabel} htmlFor="del-email">Type {email} to confirm</label>
          <input id="del-email" className={s.input} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()}>{busy ? "Working…" : scheduled ? "Delete everything now" : grace > 0 ? "Schedule deletion" : "Delete everything"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setConfirming(false); setTyped(""); setError(null); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {reauth ? <ReauthNotice className={`${s.note} ${s.err}`} linkClassName={s.link} /> : null}
    </div>
  );
}
