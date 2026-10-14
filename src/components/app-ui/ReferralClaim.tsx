"use client";

/**
 * A new account opened an invite link before signing up: claim it once, then say plainly what happened (a kit toast).
 * The invite code lives in an HttpOnly cookie (the page cannot read it); only a "waiting" flag is readable, so nothing is sent unless there is an invite.
 * Rewards are extra usage credit only; the message never promises more than the server granted.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/kit";
import { activeScopeHeaders } from "./state/scope";

type Result = { status: string; message?: string; friendCredits?: number };

/** The toast's words: the server's message, plus the credit line when credits were granted. */
export function referralText(res: Result): { title: string; description?: string } {
  const credit = res.status === "granted" && res.friendCredits ? `You got ${res.friendCredits.toLocaleString()} extra usage credits. They are used on a paid plan after its own allowance, and they are never cash.` : undefined;
  return { title: res.message ?? "", description: credit };
}

export function ReferralClaim({ signedIn, onChanged }: { signedIn: boolean; onChanged?: () => void }) {
  const changed = useRef(onChanged);
  const started = useRef(false);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { changed.current = onChanged; routerRef.current = router; });
  useEffect(() => {
    if (!signedIn || started.current || !/(?:^|;\s*)kp_ref_p=1/.test(document.cookie)) return;
    started.current = true; // once per page load, however often the parent re-renders
    fetch("/api/referrals/redeem", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...activeScopeHeaders() }, body: "{}" })
      .then((r) => (r.ok ? (r.json() as Promise<Result>) : null))
      .then((j) => {
        if (!j || j.status === "none" || !j.message) return;
        if (j.status === "granted") changed.current?.();
        // It stays until dismissed (it is read once); the terms are one click away.
        notify({ id: "referral-claim", ...referralText(j), tone: j.status === "granted" ? "success" : "neutral", duration: 0, action: { label: "Referral terms", onClick: () => routerRef.current.push("/referral-terms") } });
      })
      .catch(() => undefined);
  }, [signedIn]);
  return null;
}
