"use client";

/**
 * Account → Developer API (beta). Create and revoke API keys. A new key is shown ONCE, here, in a dismissible box; only its hash is
 * stored, so a lost key can't be recovered, only replaced. The server decides everything (plan, limits); this panel only shows it.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { confirmAction } from "@/components/kit";
import { isReauth, ReauthNotice } from "./reauth";
import s from "./account.module.css";

type Policy = { available: boolean; maxKeys: number; keyPerMinute: number; keyPerDay: number };
type Key = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null; requests: number; credits: number; /** "extension": a browser connected from the Keplar One extension, outside the key allowance. */ kind?: "key" | "extension" };
type Me = { plan: string; available: boolean; policy: Policy; statement: string; scopes: { id: string; blurb: string }[]; keys: Key[] };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(path, { method, cache: "no-store", credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!r.ok) throw Object.assign(new Error(j.error ?? "That didn't work."), { status: r.status, code: j.code });
  return j;
}

export function ApiKeysPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [reauth, setReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [usage, setUsage] = useState(false);
  const [days, setDays] = useState("90");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setMe(await api<Me>("/api/keys")); } catch (e) { setErr((e as Error).message); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(""); setReauth(false);
    try { await fn(); } catch (e) { if (isReauth(e)) setReauth(true); else setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!me) return err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : <p className={s.note}>Loading…</p>;
  const live = me.keys.filter((k) => !k.revokedAt);
  const stale = me.keys.filter((k) => k.revokedAt);
  const byHand = live.filter((k) => k.kind !== "extension");

  return (
    <div data-api-panel="">
      <p className={s.note}>Ask Keplar from your own code. {me.statement} <Link className={s.link} href="/developers">API docs</Link></p>
      {!me.available ? (
        <p className={s.note} data-api-unavailable="">API keys aren&apos;t available on the {me.plan} plan.</p>
      ) : (
        <>
          <div className={s.panel}>
            <div className={s.row}><span className={s.k}>Your plan allows</span><span className={s.v}>{me.policy.maxKeys} active keys · {me.policy.keyPerMinute} requests/min and {me.policy.keyPerDay.toLocaleString("en-US")}/day per key</span></div>
          </div>
          {fresh ? (
            <div className={s.panel} role="status" data-new-key="">
              <p className={s.note}><strong>Copy your key now.</strong> It is shown once and can&apos;t be shown again. Keep it out of public code and chats.</p>
              <code style={{ display: "block", overflowWrap: "anywhere", padding: "10px 12px" }}>{fresh}</code>
              <div className={s.actions}>
                <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => { void navigator.clipboard?.writeText(fresh).then(() => setCopied(true)).catch(() => setErr("Couldn't copy. Select the key and copy it by hand.")); }}>{copied ? "Copied" : "Copy key"}</button>
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setFresh(null); setCopied(false); }}>I&apos;ve saved it</button>
              </div>
            </div>
          ) : null}
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await api<{ key: string }>("/api/keys", "POST", { name, scopes: usage ? ["ask", "usage"] : ["ask"], expiresInDays: days === "none" ? null : Number(days) }); setFresh(r.key); setCopied(false); setName(""); await load(); }); }}>
            <label className={s.fieldLabel} htmlFor="key-name">Key name</label>
            <input spellCheck={false} id="key-name" className={s.input} value={name} maxLength={60} required placeholder="Laptop script" onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <label className={s.fieldLabel} htmlFor="key-exp">Expires</label>
            <select id="key-exp" className={s.input} value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="30">in 30 days</option><option value="90">in 90 days</option><option value="365">in 1 year</option><option value="none">never</option>
            </select>
            <label className={s.check}><input type="checkbox" checked={usage} onChange={(e) => setUsage(e.target.checked)} /> Also allow reading usage (the key can always ask)</label>
            <div className={s.actions}><button type="submit" className={`${s.btn} ${s.btnSm}`} disabled={busy || byHand.length >= me.policy.maxKeys}>Create key</button></div>
          </form>
        </>
      )}
      {err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : null}
      {reauth ? <ReauthNotice className={`${s.note} ${s.err}`} linkClassName={s.link} /> : null}
      {live.length ? (
        <ul className={s.sessions} aria-label="API keys">
          {live.map((k) => (
            <li key={k.id} className={s.session} data-key={k.name}>
              <div className={s.sessionInfo}>
                <strong>{k.name}</strong> {k.kind === "extension" ? <span className={s.badge}>Browser extension</span> : <code>{k.prefix}…</code>}
                <span className={s.sub}>{k.scopes.join(", ")} · created {day(k.createdAt)} · {k.expiresAt ? `expires ${day(k.expiresAt)}` : "no expiry"} · {k.lastUsedAt ? `last used ${day(k.lastUsedAt)}` : "never used"} · {k.requests.toLocaleString("en-US")} requests, {k.credits.toLocaleString("en-US")} credits</span>
              </div>
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={async () => { if (await confirmAction(k.kind === "extension" ? { title: `Disconnect "${k.name}"?`, body: "The extension stops working until you connect it again.", confirmLabel: "Disconnect", danger: true } : { title: `Revoke "${k.name}"?`, body: "Anything using it stops working right away.", confirmLabel: "Revoke key", danger: true })) void act(async () => { await api(`/api/keys/${k.id}`, "DELETE"); await load(); }); }}>{k.kind === "extension" ? "Disconnect" : "Revoke"}</button>
            </li>
          ))}
        </ul>
      ) : null}
      {stale.length ? <p className={s.note}>{stale.length} revoked key{stale.length === 1 ? "" : "s"} kept for your records.</p> : null}
    </div>
  );
}
