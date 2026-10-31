"use client";
/** Admin cost-guard controls: flags, kill switches, throttles, multipliers, thresholds (PUT/POST /api/admin/cost-config). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./Admin.module.css";
import p from "./Profit.module.css";

type Flags = Record<string, boolean>;
type Props = {
  flags: Flags;
  killSwitches: Record<string, boolean>;
  throttles: Record<string, { action: string; until: string; reason: string }>;
  features: { id: string; label: string }[];
  marginMultiplier: number;
  lowBalance: { percent: number; basis: string; floorUsd: number; runwayWarnDays: number; runwayCriticalDays: number };
  balanceExhausted: boolean;
};

const FLAG_LABELS: Record<string, string> = {
  enforceQuotas: "Enforce per-plan per-feature quotas",
  freeModelsOnly: "Free plan: free models only (backstop)",
  autoThrottle: "Auto-throttle negative-margin features",
  degradeOnLowBalance: "Fall back to free models when OpenRouter credit is exhausted",
  freeDailyLimits: "Free daily heavy-feature limits (owner-pending)",
  overage: "Paid pay-as-you-go overage (owner-pending)",
};

export function CostControls(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mult, setMult] = useState(String(props.marginMultiplier));
  const [pct, setPct] = useState(String(props.lowBalance.percent));
  const [basis, setBasis] = useState(props.lowBalance.basis);
  const [warnDays, setWarnDays] = useState(String(props.lowBalance.runwayWarnDays));
  const [critDays, setCritDays] = useState(String(props.lowBalance.runwayCriticalDays));
  const [throttleFeature, setThrottleFeature] = useState(props.features[0]?.id ?? "ask");

  async function call(method: "PUT" | "POST", payload: unknown, done: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/cost-config", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; rejected?: string[] };
      if (!r.ok) setMsg(j.error ?? `Failed (${r.status}).`);
      else setMsg(j.rejected?.length ? `${done} Ignored: ${j.rejected.join(", ")}.` : done);
      router.refresh();
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.controls}>
      <div className={p.grid2}>
        <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={s.eyebrow} data-o="Admin eyebrow">Guard flags</legend>
          {Object.entries(FLAG_LABELS).map(([k, label]) => (
            <label key={k} className={p.toggle}>
              <input type="checkbox" checked={Boolean(props.flags[k])} disabled={busy} onChange={(e) => call("PUT", { flags: { [k]: e.target.checked } }, `${label}: ${e.target.checked ? "on" : "off"}.`)} />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={s.eyebrow} data-o="Admin eyebrow">Feature kill switches</legend>
          <div className={p.row}>
            {props.features.map((f) => (
              <label key={f.id} className={p.toggle} title={f.label}>
                <input type="checkbox" checked={Boolean(props.killSwitches[f.id])} disabled={busy} onChange={(e) => call("PUT", { killSwitches: { [f.id]: e.target.checked } }, `${f.label} ${e.target.checked ? "switched off" : "switched on"}.`)} />
                {f.id}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className={p.grid2}>
        <div className={s.field}>
          <span className={s.eyebrow} data-o="Admin eyebrow">Pricing</span>
          <div className={p.row}>
            <label className={p.small} htmlFor="mm">Credit margin multiplier</label>
            <input id="mm" className={p.num} inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} />
            <button className={s.btn} disabled={busy} onClick={() => call("PUT", { pricing: { marginMultiplier: Number(mult) } }, "Margin multiplier saved.")}>Save</button>
          </div>
        </div>
        <div className={s.field}>
          <span className={s.eyebrow} data-o="Admin eyebrow">OpenRouter low-balance alert</span>
          <div className={p.row}>
            <input aria-label="Alert percent" className={p.num} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
            <span className={p.small}>% of</span>
            <select aria-label="Basis" className={p.select} value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="last_topup">last top-up</option>
              <option value="total">total purchased</option>
            </select>
            <button className={s.btn} disabled={busy} onClick={() => call("PUT", { lowBalance: { percent: Number(pct), basis } }, "Alert threshold saved.")}>Save</button>
          </div>
          <div className={p.row}>
            <span className={p.small}>Runway: warn at</span>
            <input aria-label="Runway warning days" className={p.num} inputMode="decimal" value={warnDays} onChange={(e) => setWarnDays(e.target.value)} />
            <span className={p.small}>days, critical at</span>
            <input aria-label="Runway critical days" className={p.num} inputMode="decimal" value={critDays} onChange={(e) => setCritDays(e.target.value)} />
            <span className={p.small}>days</span>
            <button className={s.btn} disabled={busy} onClick={() => call("PUT", { lowBalance: { runwayWarnDays: Number(warnDays), runwayCriticalDays: Number(critDays) } }, "Runway alerts saved.")}>Save</button>
          </div>
          {props.balanceExhausted ? <button className={s.warn} disabled={busy} onClick={() => call("POST", { action: "clear_balance_exhausted" }, "Paid models re-enabled.")}>Re-enable paid models (after top-up)</button> : null}
        </div>
      </div>
      <div className={s.field}>
        <span className={s.eyebrow} data-o="Admin eyebrow">Throttles</span>
        <div className={p.row}>
          <select aria-label="Feature" className={p.select} value={throttleFeature} onChange={(e) => setThrottleFeature(e.target.value)}>
            {props.features.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button className={s.warn} disabled={busy} onClick={() => call("POST", { action: "throttle", feature: throttleFeature, hours: 24, mode: "free_models" }, "Throttled for 24 h (free models).")}>Throttle 24 h</button>
          <button className={s.btn} disabled={busy} onClick={() => call("POST", { action: "run_watch" }, "Cost watch ran.")}>Run cost watch now</button>
        </div>
        {Object.entries(props.throttles).map(([f, t]) => (
          <div key={f} className={p.row}>
            <span className={`${p.tag} ${p.tagBad}`}>{f}</span>
            <span className={p.small}>{t.action === "block" ? "blocked" : "free models only"} until {t.until.replace("T", " ").slice(0, 16)} UTC — {t.reason}</span>
            <button className={s.btn} disabled={busy} onClick={() => call("POST", { action: "clear_throttle", feature: f }, `${f} throttle lifted.`)}>Lift</button>
          </div>
        ))}
      </div>
      <p className={s.msg} role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
