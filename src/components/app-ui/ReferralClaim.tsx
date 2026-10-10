"use client";

/**
 * A new account opened an invite link before signing up: claim it once, then say plainly what happened.
 * The invite code lives in an HttpOnly cookie (the page cannot read it); only a "waiting" flag is readable, so nothing is sent unless there is an invite.
 * Rewards are extra usage credit only; the message never promises more than the server granted.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { activeScopeHeaders } from "./state/scope";
import s from "./ReferralClaim.module.css";
import { Presence } from "@/components/motion/usePresence";

type Result = { status: string; message?: string; friendCredits?: number };

export function ReferralClaim({ signedIn, onChanged }: { signedIn: boolean; onChanged?: () => void }) {
  const [res, setRes] = useState<Result | null>(null);
  const changed = useRef(onChanged);
  const started = useRef(false);
  useEffect(() => { changed.current = onChanged; });
  useEffect(() => {
    if (!signedIn || started.current || !/(?:^|;\s*)kp_ref_p=1/.test(document.cookie)) return;
    started.current = true; // once per page load, however often the parent re-renders
    fetch("/api/referrals/redeem", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...activeScopeHeaders() }, body: "{}" })
      .then((r) => (r.ok ? (r.json() as Promise<Result>) : null))
      .then((j) => { if (j && j.status !== "none" && j.message) { setRes(j); if (j.status === "granted") changed.current?.(); } })
      .catch(() => undefined);
  }, [signedIn]);
  return <Presence value={res?.message ? res : null}>{(res, p) => (
    <div className={s.toast} role="status" aria-live="polite" data-status={res.status} {...p.motion("toast")}>
      <p className={s.text}>
        {res.message}
        {res.status === "granted" && res.friendCredits ? <> You got {res.friendCredits.toLocaleString()} extra usage credits. They are used on a paid plan after its own allowance, and they are never cash.</> : null}{" "}
        <Link href="/referral-terms">Referral terms</Link>
      </p>
      <button type="button" className={s.close} onClick={() => setRes(null)}>Dismiss</button>
    </div>
  )}</Presence>;
}
