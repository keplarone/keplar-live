"use client";
import { useState } from "react";
import { switchToAccount } from "@/components/account/switch-account";
import s from "./SavedAccounts.module.css";

/** Accounts that are still signed in on this device: one click switches to them, no password, no email. */
export function SavedAccounts({ accounts }: { accounts: { slot: number; email: string; name: string | null }[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!accounts.length) return null;
  return (
    <section className={s.box} aria-label="Accounts signed in on this device" data-saved-accounts="">
      <p className={s.title}>Signed in on this device</p>
      <ul className={s.list}>
        {accounts.map((a) => (
          <li key={a.slot}>
            <button
              type="button"
              className={s.row}
              disabled={busy !== null}
              data-saved-account={a.email}
              onClick={async () => {
                setBusy(a.slot);
                setProblem(null);
                const r = await switchToAccount(a.slot);
                if (!r.ok) { setProblem(r.message); setBusy(null); }
              }}
            >
              <span className={s.avatar} aria-hidden="true">{(a.name || a.email)[0]}</span>
              <span className={s.who}><span className={s.name}>{a.name || a.email.split("@")[0]}</span><span className={s.email}>{a.email}</span></span>
              <span className={s.go}>{busy === a.slot ? "Switching…" : "Use"}</span>
            </button>
          </li>
        ))}
      </ul>
      {problem ? <p className={s.problem} role="alert">{problem}</p> : null}
    </section>
  );
}
