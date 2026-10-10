"use client";

import { useState } from "react";
import s from "./Admin.module.css";

type Status = {
  configured: boolean; label: string; source: string | null; shape: string | null; killSwitch: boolean;
  envNames: { primary: string; fallbackKey: string; fallbackSecret: string };
  defaults: { video: string; image: string; imageFallback: string };
  models: { video: number; image: number; priceTbd: number };
  check?: { ok: boolean; state: "valid" | "rejected" | "unreachable" | "not_configured" };
};

const CHECK_TEXT: Record<string, string> = {
  valid: "Credentials accepted by Higgsfield.",
  rejected: "Higgsfield rejected the credentials. Re-create the key in Higgsfield Console and update the Vercel variable.",
  unreachable: "Couldn't reach Higgsfield just now. Try again.",
  not_configured: "Nothing to test yet.",
};

/** Connect Higgsfield: shows whether the server sees credentials. Keys are added in Vercel env vars, never here; values are never shown. */
export function ConnectHiggsfield({ initial }: { initial: Status }) {
  const [st, setSt] = useState<Status>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function test() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/higgsfield", { method: "POST" });
      const j = (await r.json()) as Status & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't test.");
      setSt(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.controls} data-testid="connect-higgsfield">
      <p role="status" data-testid="higgsfield-status" data-configured={st.configured}>
        <strong>{st.label}</strong>
        {st.configured && st.source ? <> · read from <code>{st.source}</code></> : null}
      </p>
      {!st.configured ? (
        <p className={s.sub}>
          Add <code>{st.envNames.primary}</code> (<code>KEY_ID:KEY_SECRET</code>) in Vercel &rarr; Project &rarr; Settings &rarr; Environment Variables, then redeploy. Alternatively add <code>{st.envNames.fallbackKey}</code> and <code>{st.envNames.fallbackSecret}</code>. Keys are never entered or shown here.
        </p>
      ) : null}
      <p className={s.sub}>Default video model: {st.defaults.video}. Default image model: {st.defaults.image} (fallback: {st.defaults.imageFallback}). {st.models.video} video and {st.models.image} image models listed; {st.models.priceTbd} with price TBD until quoted.</p>
      <div className={s.switches}>
        <button type="button" className={s.btn} disabled={busy || !st.configured} onClick={() => void test()}>{busy ? "Testing…" : "Test connection"}</button>
      </div>
      {st.check ? <p role="status" data-testid="higgsfield-check">{CHECK_TEXT[st.check.state]}</p> : null}
      {err ? <p role="alert">{err}</p> : null}
    </div>
  );
}
