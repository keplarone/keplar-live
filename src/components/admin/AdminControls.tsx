"use client";

import { useState } from "react";
import s from "./Admin.module.css";

type State = { globalStop: boolean; pauseMedia: boolean; pauseAgents: boolean; pausePayments?: boolean; disabledProviders: string[]; disabledModels: string[]; autoPauseUntil: string | null; reason: string };

type Hourly = { edit: { providerUsd?: number; modelUsd?: number; modelCalls?: number; overrides?: Record<string, { usd?: number; calls?: number }> }; effective: { providerUsd: number; modelUsd: number; modelCalls: number }; env: { providerUsd: number; modelUsd: number; modelCalls: number } };

export function AdminControls({ initial, autoPaused, hourly }: { initial: State; autoPaused: boolean; hourly: Hourly }) {
  const [hp, setHp] = useState(String(hourly.edit.providerUsd ?? ""));
  const [hm, setHm] = useState(String(hourly.edit.modelUsd ?? ""));
  const [hc, setHc] = useState(String(hourly.edit.modelCalls ?? ""));
  const [ho, setHo] = useState(Object.entries(hourly.edit.overrides ?? {}).map(([k, v]) => `${k}=${v.usd ?? ""}/${v.calls ?? ""}`).join(", "));
  const [st, setSt] = useState(initial);
  const [reason, setReason] = useState("");
  const [providers, setProviders] = useState(initial.disabledProviders.join(", "));
  const [models, setModels] = useState(initial.disabledModels.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(patch: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...patch, reason }) });
      const j = (await r.json()) as { controls?: State; error?: string };
      if (!r.ok || !j.controls) throw new Error(j.error || "Could not save.");
      setSt(j.controls);
      setProviders(j.controls.disabledProviders.join(", "));
      setModels(j.controls.disabledModels.join(", "));
      setMsg("Saved and written to the audit log.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <div className={s.controls}>
      <label className={s.field}>
        <span>Reason (required for a global stop, kept in the audit log)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. provider incident, cost spike" />
      </label>
      <div className={s.switches}>
        <button type="button" disabled={busy} className={st.globalStop ? s.danger : s.btn} aria-pressed={st.globalStop} onClick={() => send({ globalStop: !st.globalStop }, st.globalStop ? undefined : "Stop ALL model calls, media and agents for every user?")}>
          {st.globalStop ? "Global stop ON — resume" : "Global AI stop"}
        </button>
        <button type="button" disabled={busy} className={st.pauseMedia ? s.warn : s.btn} aria-pressed={st.pauseMedia} onClick={() => send({ pauseMedia: !st.pauseMedia })}>
          {st.pauseMedia ? "Media paused — resume" : "Pause image + video"}
        </button>
        <button type="button" disabled={busy} className={st.pauseAgents ? s.warn : s.btn} aria-pressed={st.pauseAgents} onClick={() => send({ pauseAgents: !st.pauseAgents })}>
          {st.pauseAgents ? "Agents paused — resume" : "Pause agents"}
        </button>
        <button type="button" disabled={busy} className={st.pausePayments ? s.danger : s.btn} aria-pressed={Boolean(st.pausePayments)} onClick={() => send({ pausePayments: !st.pausePayments }, st.pausePayments ? undefined : "Stop NEW seller checkouts for every store? Existing orders, refunds and webhooks keep working.")}>
          {st.pausePayments ? "Seller payments paused — resume" : "Pause seller payments"}
        </button>
        {autoPaused && st.autoPauseUntil ? (
          <button type="button" disabled={busy} className={s.btn} onClick={() => send({ clearAutoPause: true })}>Clear spike auto-pause</button>
        ) : null}
      </div>
      <label className={s.field}>
        <span>Disabled providers or vendors (comma separated, e.g. openrouter, direct:openai, anthropic)</span>
        <input value={providers} onChange={(e) => setProviders(e.target.value)} />
      </label>
      <label className={s.field}>
        <span>Disabled model ids (comma separated)</span>
        <input value={models} onChange={(e) => setModels(e.target.value)} />
      </label>
      <div className={s.switches}>
        <button type="button" disabled={busy} className={s.btn} onClick={() => send({ disabledProviders: list(providers), disabledModels: list(models) })}>Save provider and model switches</button>
      </div>
      <fieldset className={s.field}>
        <legend>Hourly limits (leave a box empty to use the default; the default is the environment value shown)</legend>
        <label className={s.field}><span>Provider USD per hour (default ${hourly.env.providerUsd}, now ${hourly.effective.providerUsd})</span><input inputMode="decimal" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
        <label className={s.field}><span>Model USD per hour (default ${hourly.env.modelUsd}, now ${hourly.effective.modelUsd})</span><input inputMode="decimal" value={hm} onChange={(e) => setHm(e.target.value)} /></label>
        <label className={s.field}><span>Model calls per hour (default {hourly.env.modelCalls}, now {hourly.effective.modelCalls})</span><input inputMode="numeric" value={hc} onChange={(e) => setHc(e.target.value)} /></label>
        <label className={s.field}><span>Per-id overrides: id=usd/calls, comma separated (e.g. openrouter=20/, some/model=2/200)</span><input value={ho} onChange={(e) => setHo(e.target.value)} /></label>
        <div className={s.switches}>
          <button type="button" disabled={busy} className={s.btn} onClick={() => {
            const overrides: Record<string, { usd?: number; calls?: number }> = {};
            for (const part of list(ho)) {
              const [k, v = ""] = part.split("=");
              const [u = "", c = ""] = v.split("/");
              overrides[k.trim()] = { ...(u.trim() ? { usd: Number(u) } : {}), ...(c.trim() ? { calls: Number(c) } : {}) };
            }
            send({ hourly: { providerUsd: hp.trim() ? Number(hp) : undefined, modelUsd: hm.trim() ? Number(hm) : undefined, modelCalls: hc.trim() ? Number(hc) : undefined, overrides } });
          }}>Save hourly limits</button>
        </div>
      </fieldset>
      <p className={s.msg} role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
