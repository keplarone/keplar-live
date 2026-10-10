"use client";
/** Plus/Pro: opt in to pay-as-you-go above plan limits with a monthly cap (renders nothing while the owner-pending flag is off). */
import { useEffect, useState } from "react";
import s from "./Usage.module.css";

type Status = { enabled: boolean; eligible?: boolean; optedIn?: boolean; capUsd?: number; usedUsd?: number; pct?: number; multiplier?: number; creditPack?: { credits: number; usd: number }; priceList?: { unit: string; usd: number }[]; features?: string[]; alertPcts?: number[]; maxCapUsd?: number; billingLinked?: boolean };

export function OverageSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/billing/overage", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: Status | null) => {
      setSt(j);
      if (j?.capUsd) setCap(String(j.capUsd));
    }).catch(() => undefined);
  }, []);
  if (!st?.enabled || !st.eligible) return null;
  async function save(patch: { optedIn?: boolean; capUsd?: number }) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/billing/overage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) setMsg(j.error ?? "Could not save.");
      else {
        setSt(j);
        setMsg("Saved.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.card} aria-labelledby="overage-h">
      <h2 id="overage-h">Pay as you go above your plan</h2>
      <p className={s.sub}>When your monthly credits run out, heavy features ({(st.features ?? []).join(", ")}) can keep going at ${(st.creditPack?.usd ?? 7.5).toFixed(2)} per {(st.creditPack?.credits ?? 1000).toLocaleString("en-US")} credits (the Plus rate), billed monthly, never past your cap. We email you at {(st.alertPcts ?? []).join("%, ")}% of the cap.</p>
      <label className={s.field}><input type="checkbox" checked={Boolean(st.optedIn)} disabled={busy} onChange={(e) => save({ optedIn: e.target.checked })} /> Keep going past my plan&apos;s limits</label>
      <div className={s.field}>
        <label htmlFor="ovg-cap">Monthly cap ($)</label>
        <input id="ovg-cap" type="number" min={1} max={st.maxCapUsd} step={1} value={cap} onChange={(e) => setCap(e.target.value)} />
        <button className={s.btn} disabled={busy} onClick={() => save({ capUsd: Number(cap) })}>Save cap</button>
      </div>
      <div className={s.row}>
        <span>This month</span>
        <span className={s.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.pct ?? 0} aria-label="Share of cap used"><span style={{ width: `${st.pct ?? 0}%` }} /></span>
        <span className={s.left}>${(st.usedUsd ?? 0).toFixed(2)} of ${(st.capUsd ?? 0).toFixed(0)}</span>
      </div>
      {st.priceList?.length ? (
        <details className={s.sub}>
          <summary>Price list</summary>
          <div className={s.rows}>
            {st.priceList.map((p) => (
              <div className={s.row} key={p.unit}><span>{p.unit}</span><span className={s.left}>${p.usd.toFixed(2)}</span></div>
            ))}
          </div>
        </details>
      ) : null}
      {!st.billingLinked && st.optedIn ? <p className={s.sub}>We&apos;ll ask you to confirm a payment method before the first overage charge.</p> : null}
      <p className={s.msg} role="status" aria-live="polite">{msg}</p>
    </section>
  );
}
