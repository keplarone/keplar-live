"use client";
/** Free plan: what's left today on the heavy features (renders nothing while the owner-pending flag is off). */
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./Usage.module.css";

type Allowance = { enabled: boolean; applies?: boolean; signedIn?: boolean; questionsPerDay?: number; resetsAt?: string; upgradeUrl?: string; heavy?: { feature: string; label: string; limit: number; used: number; left: number }[] };

export function FreeAllowance() {
  const [a, setA] = useState<Allowance | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/usage/allowance", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => live && setA(j)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!a?.enabled || !a.applies || !a.heavy?.length) return null;
  const resets = a.resetsAt ? new Date(a.resetsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "midnight UTC";
  return (
    <section className={s.card} aria-labelledby="free-allowance-h">
      <h2 id="free-allowance-h">Your free allowance today</h2>
      <p className={s.sub}>Up to {a.questionsPerDay} questions a day on free models, plus a few runs of the heavier tools. Everything resets at {resets}.</p>
      <ul className={s.rows}>
        {a.heavy.map((h) => (
          <li key={h.feature} className={s.row}>
            <span>{h.label}</span>
            <span className={s.meter} role="meter" aria-valuemin={0} aria-valuemax={h.limit} aria-valuenow={h.left} aria-label={`${h.label}: ${h.left} of ${h.limit} left`}><span style={{ width: `${h.limit ? (h.left / h.limit) * 100 : 0}%` }} /></span>
            <span className={`${s.left} ${h.left === 0 ? s.out : ""}`}>{h.left} of {h.limit} left</span>
          </li>
        ))}
      </ul>
      {!a.signedIn ? <p className={s.sub}>Sign in to keep your allowance across devices.</p> : null}
      <Link className={s.cta} href={a.upgradeUrl ?? "/pricing"}>Need more? See Plus</Link>
    </section>
  );
}
