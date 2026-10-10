"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { welcomePath } from "@/lib/onboarding/model";
import { replayOnboarding } from "./api";
import s from "@/components/account/account.module.css";

/** Settings > Getting started. "Replay onboarding" for accounts that went through it; "Take the tour" for older accounts (offered, never forced). */
export function ReplayOnboarding({ legacy }: { legacy: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await replayOnboarding();
      router.push(welcomePath("/account"));
    } catch {
      setBusy(false);
      setError("Couldn't start it just now. Try again in a moment.");
    }
  };
  return (
    <div className={s.panel}>
      <div className={s.row}>
        <span className={s.k} id="replay-onboarding">{legacy ? "One-minute tour" : "Onboarding"}</span>
        <button type="button" className={s.btn} style={{ height: 36 }} onClick={() => void go()} disabled={busy}>
          {busy ? "Opening…" : legacy ? "Take the tour" : "Replay onboarding"}
        </button>
      </div>
      <p className={s.note}>{legacy ? "A short walk through what Keplar does and how to set it up. Every step can be skipped." : "Go through the welcome steps again: what you use Keplar for, your name, theme, typing and memory. Your answers so far are kept as the starting point."}</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
    </div>
  );
}
