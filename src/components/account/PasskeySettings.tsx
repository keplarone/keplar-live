"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { confirmAction } from "@/components/kit";
import { isReauth, ReauthNotice } from "./reauth";
import s from "./account.module.css";

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null; synced: boolean };

const noSubscribe = () => () => undefined;

async function api(method: "GET" | "POST", payload?: unknown) {
  const res = await fetch("/api/account/passkeys", { method, headers: { "content-type": "application/json" }, credentials: "same-origin", cache: "no-store", body: payload ? JSON.stringify(payload) : undefined });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: res.status, code: j.code });
  return j;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Passkeys: optional, extra ways to sign in with a fingerprint, face or device PIN. Hidden when the account database isn't connected. */
export function PasskeySettings() {
  const [list, setList] = useState<Passkey[] | null>(null);
  const [off, setOff] = useState(false);
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => true);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api("GET").then((j) => live && setList(j.passkeys as Passkey[])).catch((e: Error & { status?: number }) => live && (e.status === 501 || e.status === 401) && setOff(true));
    return () => { live = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setReauth(false);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      const err = e as Error & { name?: string };
      // The person closing the browser's prompt is not an error worth shouting about.
      if (isReauth(err)) setReauth(true);
      else setError(err.name === "NotAllowedError" ? "The passkey prompt was closed or timed out. Try again when you're ready." : err.message || "Something went wrong.");
    }
    setBusy(false);
  }

  const add = () =>
    run(async () => {
      const o = (await api("POST", { action: "options" })) as unknown as { options: Parameters<typeof startRegistration>[0]["optionsJSON"]; token: string };
      const response = await startRegistration({ optionsJSON: o.options });
      const j = await api("POST", { action: "add", token: o.token, response, name: name.trim() });
      setList(j.passkeys as Passkey[]);
      setName("");
      setNote("Passkey added. You can now sign in with it from the sign-in page.");
    });

  if (off) return null;
  return (
    <div className={s.panel} id="passkeys" aria-labelledby="passkeys-h">
      <div className={s.row}>
        <h2 id="passkeys-h" className={s.cardTitle}>Passkeys</h2>
        <span className={s.v}>{list ? (list.length ? `${list.length} added` : "None") : "…"}</span>
      </div>
      <p className={s.note}>A passkey lets you sign in with your fingerprint, face or device PIN instead of an email link. It&rsquo;s optional and extra: your other ways to sign in keep working. Passkeys stay on your device or in your password manager; Keplar only keeps the public half.</p>
      {list && list.length > 0 ? (
        <ul className={s.note} style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--s-3)" }}>
          {list.map((p) => (
            <li key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", alignItems: "center", justifyContent: "space-between" }}>
              {renaming === p.id ? (
                <form
                  style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => { setList((await api("POST", { action: "rename", id: p.id, name: draft })).passkeys as Passkey[]); setRenaming(null); });
                  }}
                >
                  <label className={s.fieldLabel} htmlFor={`pk-name-${p.id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Passkey name</label>
                  <input id={`pk-name-${p.id}`} className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} autoFocus />
                  <button type="submit" className={s.btn} disabled={busy || !draft.trim()}>Save</button>
                  <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setRenaming(null)} disabled={busy}>Cancel</button>
                </form>
              ) : (
                <>
                  <span>
                    <strong>{p.name}</strong>
                    {p.synced ? " · synced" : ""}
                    <br />
                    Added {day(p.createdAt)} · {p.lastUsedAt ? `last used ${day(p.lastUsedAt)}` : "not used yet"}
                  </span>
                  <span className={s.actions}>
                    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setRenaming(p.id); setDraft(p.name); }} disabled={busy} aria-label={`Rename ${p.name}`}>Rename</button>
                    <button
                      type="button"
                      className={`${s.btn} ${s.btnGhost}`}
                      disabled={busy}
                      aria-label={`Remove ${p.name}`}
                      onClick={async () => { if (await confirmAction({ title: `Remove the passkey “${p.name}”?`, body: "You won't be able to sign in with it any more.", confirmLabel: "Remove passkey", danger: true })) void run(async () => { setList((await api("POST", { action: "remove", id: p.id })).passkeys as Passkey[]); setNote("Passkey removed."); }); }}
                    >
                      Remove
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {list && supported ? (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className={s.fieldLabel} htmlFor="pk-new-name">Name this passkey (optional)</label>
          <input spellCheck={false} id="pk-new-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="For example, My laptop" autoComplete="off" />
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy}>{busy ? "Waiting for your device…" : "Add a passkey"}</button>
          </div>
        </form>
      ) : list ? (
        <p className={s.note}>This browser doesn&rsquo;t support passkeys. Try a current version of Chrome, Safari, Edge or Firefox.</p>
      ) : null}
      {note ? <p className={s.note} role="status">{note}</p> : null}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {reauth ? <ReauthNotice className={`${s.note} ${s.err}`} linkClassName={s.link} /> : null}
    </div>
  );
}
